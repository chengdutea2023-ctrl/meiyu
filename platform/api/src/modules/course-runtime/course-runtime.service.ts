import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClassMemberRole,
  CourseAssignmentStatus,
  CourseRuntimeType,
  CourseStatus,
  LearningRecordStatus,
  Prisma,
  UserApprovalStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseLaunchDto } from './dto/create-course-launch.dto';
import { UpsertLaunchLearningRecordDto } from './dto/upsert-launch-learning-record.dto';
import { UpsertLearningRecordDto } from './dto/upsert-learning-record.dto';

type CourseLookup = {
  courseId?: string;
  courseSlug?: string;
};

type LearningRecordInput = CourseLookup & {
  assignmentId?: string;
  classId?: string;
  status: LearningRecordStatus;
  score?: number;
  durationSeconds?: number;
  summary?: Record<string, unknown>;
};

@Injectable()
export class CourseRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createLaunch(studentId: string, dto: CreateCourseLaunchDto) {
    await this.ensureApprovedStudent(studentId);

    const course = await this.findPublishedCourse(dto);
    const assignment = dto.assignmentId
      ? await this.prisma.courseAssignment.findUnique({
          where: { id: dto.assignmentId },
        })
      : null;

    if (assignment) {
      if (assignment.courseId !== course.id) {
        throw new BadRequestException('Assignment does not belong to course');
      }
      if (assignment.status !== CourseAssignmentStatus.ACTIVE) {
        throw new ForbiddenException('Assignment is not active');
      }
      await this.ensureStudentInClass(studentId, assignment.classId);
    }

    const classId = assignment?.classId ?? dto.classId;
    if (classId) {
      await this.ensureStudentInClass(studentId, classId);
    }

    const launchToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.launchTokenTtlSeconds() * 1000);
    const session = await this.prisma.courseLaunchSession.create({
      data: {
        tokenHash: this.hashLaunchToken(launchToken),
        courseId: course.id,
        assignmentId: assignment?.id ?? null,
        classId: classId ?? null,
        studentId,
        expiresAt,
      },
      include: this.launchSessionInclude(),
    });

    const record = await this.upsertStudentRecord(studentId, {
      courseId: course.id,
      assignmentId: assignment?.id,
      classId,
      status: LearningRecordStatus.STARTED,
      summary: { source: 'course-launch', launchSessionId: session.id },
    });

    return {
      launchToken,
      launchUrl: this.appendLaunchToken(course.entryUrl, launchToken),
      expiresAt,
      context: this.toLaunchContext(session),
      record,
    };
  }

  async verifyLaunch(launchToken: string) {
    const session = await this.findValidLaunchSession(launchToken);
    const updated = await this.prisma.courseLaunchSession.update({
      where: { id: session.id },
      data: { lastVerifiedAt: new Date() },
      include: this.launchSessionInclude(),
    });

    return {
      context: this.toLaunchContext(updated),
      reportEndpoint: '/api/v1/course-runtime/launch/records',
    };
  }

  async upsertLaunchRecord(dto: UpsertLaunchLearningRecordDto) {
    const session = await this.findValidLaunchSession(dto.launchToken);

    return this.upsertStudentRecord(session.studentId, {
      courseId: session.courseId,
      assignmentId: session.assignmentId ?? undefined,
      classId: session.classId ?? undefined,
      status: dto.status,
      score: dto.score,
      durationSeconds: dto.durationSeconds,
      summary: dto.summary,
    });
  }

  async upsertRecord(studentId: string, dto: UpsertLearningRecordDto) {
    await this.ensureApprovedStudent(studentId);
    return this.upsertStudentRecord(studentId, dto);
  }

  private async upsertStudentRecord(studentId: string, dto: LearningRecordInput) {
    const course = await this.findPublishedCourse(dto);
    const assignment = dto.assignmentId
      ? await this.prisma.courseAssignment.findUnique({
          where: { id: dto.assignmentId },
          include: { course: true },
        })
      : null;

    if (assignment) {
      if (assignment.courseId !== course.id) {
        throw new BadRequestException('Assignment does not belong to course');
      }
      if (assignment.status !== CourseAssignmentStatus.ACTIVE) {
        throw new ForbiddenException('Assignment is not active');
      }
      await this.ensureStudentInClass(studentId, assignment.classId);
    }

    const classId = assignment?.classId ?? dto.classId;
    if (classId) {
      await this.ensureStudentInClass(studentId, classId);
    }

    const existing = await this.prisma.learningRecord.findFirst({
      where: {
        studentId,
        courseId: course.id,
        assignmentId: assignment?.id ?? null,
        classId: classId ?? null,
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const data: Prisma.LearningRecordUncheckedCreateInput = {
      courseId: course.id,
      assignmentId: assignment?.id ?? null,
      classId: classId ?? null,
      studentId,
      status: dto.status,
      score: dto.score,
      durationSeconds: dto.durationSeconds,
      summary: dto.summary as Prisma.InputJsonValue,
      startedAt: dto.status === LearningRecordStatus.STARTED ? now : undefined,
      completedAt: dto.status === LearningRecordStatus.COMPLETED ? now : undefined,
    };

    if (!existing) {
      const record = await this.prisma.learningRecord.create({
        data,
        include: this.includeRelations(),
      });
      return this.toRecord(record);
    }

    const record = await this.prisma.learningRecord.update({
      where: { id: existing.id },
      data: {
        status: dto.status,
        ...(dto.score !== undefined ? { score: dto.score } : {}),
        ...(dto.durationSeconds !== undefined ? { durationSeconds: dto.durationSeconds } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary as Prisma.InputJsonValue } : {}),
        ...(dto.status === LearningRecordStatus.STARTED && !existing.startedAt
          ? { startedAt: now }
          : {}),
        ...(dto.status === LearningRecordStatus.COMPLETED ? { completedAt: now } : {}),
      },
      include: this.includeRelations(),
    });

    return this.toRecord(record);
  }

  private async findValidLaunchSession(launchToken: string) {
    const session = await this.prisma.courseLaunchSession.findUnique({
      where: { tokenHash: this.hashLaunchToken(launchToken) },
      include: this.launchSessionInclude(),
    });

    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('Launch token is invalid or expired');
    }

    if (session.course.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException('Published course not found');
    }

    if (
      session.student.status !== UserStatus.ACTIVE ||
      session.student.approvalStatus !== UserApprovalStatus.APPROVED ||
      session.student.userType !== UserType.STUDENT
    ) {
      throw new ForbiddenException('Student is not allowed to access this course');
    }

    if (session.assignment && session.assignment.status !== CourseAssignmentStatus.ACTIVE) {
      throw new ForbiddenException('Assignment is not active');
    }

    return session;
  }

  private async findPublishedCourse(dto: CourseLookup) {
    if (!dto.courseId && !dto.courseSlug) {
      throw new BadRequestException('courseId or courseSlug is required');
    }

    const course = dto.courseId
      ? await this.prisma.course.findUnique({ where: { id: dto.courseId } })
      : await this.prisma.course.findUnique({ where: { slug: dto.courseSlug } });

    if (!course || course.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException('Published course not found');
    }

    return course;
  }

  private async ensureApprovedStudent(studentId: string) {
    const student = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (
      !student ||
      student.status !== UserStatus.ACTIVE ||
      student.approvalStatus !== UserApprovalStatus.APPROVED ||
      student.userType !== UserType.STUDENT
    ) {
      throw new ForbiddenException('Only approved students can access course runtime');
    }

    return student;
  }

  private async ensureStudentInClass(studentId: string, classId: string) {
    const membership = await this.prisma.userClass.findUnique({
      where: {
        userId_classId: {
          userId: studentId,
          classId,
        },
      },
    });

    if (!membership || membership.role !== ClassMemberRole.STUDENT) {
      throw new ForbiddenException('Student is not in this class');
    }
  }

  private launchTokenTtlSeconds() {
    return Number(this.config.get<string>('COURSE_LAUNCH_TOKEN_TTL_SECONDS', '3600'));
  }

  private hashLaunchToken(launchToken: string) {
    return createHash('sha256').update(launchToken).digest('hex');
  }

  private appendLaunchToken(entryUrl: string, launchToken: string) {
    try {
      const url = new URL(entryUrl);
      url.searchParams.set('launchToken', launchToken);
      return url.toString();
    } catch {
      const separator = entryUrl.includes('?') ? '&' : '?';
      return `${entryUrl}${separator}launchToken=${encodeURIComponent(launchToken)}`;
    }
  }

  private launchSessionInclude() {
    return {
      course: true,
      assignment: true,
      class: {
        include: {
          organization: true,
        },
      },
      student: {
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          userType: true,
          approvalStatus: true,
          ageBand: true,
          status: true,
          isPlatformAdmin: true,
        },
      },
    } as const;
  }

  private includeRelations() {
    return {
      course: true,
      assignment: true,
      class: {
        include: {
          organization: true,
        },
      },
      student: {
        select: {
          id: true,
          email: true,
          displayName: true,
          ageBand: true,
        },
      },
    } as const;
  }

  private toLaunchContext(session: {
    id: string;
    expiresAt: Date;
    course: {
      id: string;
      slug: string;
      title: string;
      description: string | null;
      runtimeType: CourseRuntimeType;
      entryUrl: string;
    };
    assignment: {
      id: string;
      title: string;
      instructions: string | null;
      startAt: Date | null;
      dueAt: Date | null;
    } | null;
    class: {
      id: string;
      name: string;
      code: string | null;
      organization: {
        id: string;
        name: string;
        code: string | null;
      };
    } | null;
    student: {
      id: string;
      email: string;
      username: string | null;
      displayName: string | null;
      userType: UserType;
      approvalStatus: UserApprovalStatus;
      ageBand: string | null;
      isPlatformAdmin: boolean;
    };
  }) {
    return {
      launchSessionId: session.id,
      expiresAt: session.expiresAt,
      student: session.student,
      course: session.course,
      assignment: session.assignment,
      class: session.class,
    };
  }

  private toRecord(record: {
    id: string;
    status: LearningRecordStatus;
    score: number | null;
    durationSeconds: number | null;
    summary: unknown;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    course: {
      id: string;
      slug: string;
      title: string;
      entryUrl: string;
    };
    assignment: {
      id: string;
      title: string;
    } | null;
    class: {
      id: string;
      name: string;
      organization: {
        id: string;
        name: string;
      };
    } | null;
    student: {
      id: string;
      email: string;
      displayName: string | null;
      ageBand: string | null;
    };
  }) {
    return {
      id: record.id,
      status: record.status,
      score: record.score,
      durationSeconds: record.durationSeconds,
      summary: record.summary,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      course: record.course,
      assignment: record.assignment,
      class: record.class,
      student: record.student,
    };
  }
}
