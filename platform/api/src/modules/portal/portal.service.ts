import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ClassMemberRole,
  CourseAssignmentStatus,
  CourseStatus,
  Prisma,
  UserApprovalStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';

@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: this.userContextInclude(),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toPortalUser(user);
  }

  async teacherClasses(userId: string) {
    await this.ensureRole(userId, UserType.TEACHER);
    const memberships = await this.prisma.userClass.findMany({
      where: { userId, role: ClassMemberRole.TEACHER },
      orderBy: { createdAt: 'desc' },
      include: {
        class: {
          include: {
            organization: true,
            _count: { select: { members: true, courseAssignments: true } },
          },
        },
      },
    });

    return {
      classes: memberships.map((membership) => ({
        id: membership.class.id,
        name: membership.class.name,
        code: membership.class.code,
        status: membership.class.status,
        organization: {
          id: membership.class.organization.id,
          name: membership.class.organization.name,
        },
        membersCount: membership.class._count.members,
        assignmentsCount: membership.class._count.courseAssignments,
      })),
    };
  }

  async teacherClassStudents(userId: string, classId: string) {
    await this.ensureTeacherClass(userId, classId);
    const members = await this.prisma.userClass.findMany({
      where: { classId, role: ClassMemberRole.STUDENT, user: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    return {
      students: members.map((member) => ({
        id: member.user.id,
        email: member.user.email,
        username: member.user.username,
        displayName: member.user.displayName,
        userType: member.user.userType,
        approvalStatus: member.user.approvalStatus,
        ageBand: member.user.ageBand,
        status: member.user.status,
      })),
    };
  }

  async teacherCourses(userId: string) {
    await this.ensureRole(userId, UserType.TEACHER);
    const courses = await this.prisma.course.findMany({
      where: {
        deletedAt: null,
        OR: [
          { status: CourseStatus.PUBLISHED },
          { createdByUserId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        coursewares: {
          where: { status: CourseStatus.PUBLISHED, deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        _count: {
          select: {
            assignments: true,
            learningRecords: true,
            coursewares: true,
          },
        },
      },
      take: 200,
    });

    return { courses };
  }

  async createTeacherAssignment(userId: string, dto: CreateAssignmentDto) {
    await this.ensureTeacherClass(userId, dto.classId);
    const course = await this.prisma.course.findFirst({
      where: { id: dto.courseId, deletedAt: null },
    });

    if (!course || course.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException('Published course not found');
    }

    const publishedCoursewareCount = await this.prisma.courseware.count({
      where: { courseId: course.id, status: CourseStatus.PUBLISHED, deletedAt: null },
    });
    if (publishedCoursewareCount === 0) {
      throw new NotFoundException('课程下没有已发布课件，暂不能布置');
    }

    const assignment = await this.prisma.courseAssignment.create({
      data: {
        courseId: dto.courseId,
        classId: dto.classId,
        teacherId: userId,
        title: dto.title.trim(),
        instructions: dto.instructions?.trim() || null,
        startAt: dto.startAt ? new Date(dto.startAt) : null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      },
      include: this.assignmentInclude(),
    });

    return this.toAssignment(assignment);
  }

  async teacherAssignments(userId: string) {
    await this.ensureRole(userId, UserType.TEACHER);
    const assignments = await this.prisma.courseAssignment.findMany({
      where: { teacherId: userId, course: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      include: this.assignmentInclude(),
      take: 200,
    });

    return { assignments: assignments.map((assignment) => this.toAssignment(assignment)) };
  }

  async teacherLearningRecords(
    userId: string,
    query: { classId?: string; assignmentId?: string; courseId?: string; coursewareId?: string },
  ) {
    await this.ensureRole(userId, UserType.TEACHER);
    const classIds = await this.teacherClassIds(userId);

    if (query.classId && !classIds.includes(query.classId)) {
      throw new ForbiddenException('Teacher can only access own classes');
    }

    const records = await this.prisma.learningRecord.findMany({
      where: {
        classId: query.classId ?? { in: classIds },
        ...(query.assignmentId ? { assignmentId: query.assignmentId } : {}),
        ...(query.courseId ? { courseId: query.courseId } : {}),
        ...(query.coursewareId ? { coursewareId: query.coursewareId } : {}),
        course: { deletedAt: null },
        courseware: { deletedAt: null },
        student: { deletedAt: null },
      },
      orderBy: { updatedAt: 'desc' },
      include: this.learningRecordInclude(),
      take: 300,
    });

    return { records: records.map((record) => this.toLearningRecord(record)) };
  }

  async studentCourses(userId: string) {
    await this.ensureRole(userId, UserType.STUDENT);
    const classIds = await this.studentClassIds(userId);
    const assignments = await this.prisma.courseAssignment.findMany({
      where: {
        classId: { in: classIds },
        status: CourseAssignmentStatus.ACTIVE,
        course: { status: CourseStatus.PUBLISHED, deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      include: this.assignmentInclude(),
      take: 200,
    });

    const courseMap = new Map<string, ReturnType<typeof this.toAssignment>['course']>();
    for (const assignment of assignments) {
      courseMap.set(assignment.course.id, this.toAssignment(assignment).course);
    }

    return { courses: Array.from(courseMap.values()) };
  }

  async studentAssignments(userId: string) {
    await this.ensureRole(userId, UserType.STUDENT);
    const classIds = await this.studentClassIds(userId);
    const assignments = await this.prisma.courseAssignment.findMany({
      where: {
        classId: { in: classIds },
        status: CourseAssignmentStatus.ACTIVE,
        course: { status: CourseStatus.PUBLISHED, deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      include: this.assignmentInclude(),
      take: 200,
    });

    return { assignments: assignments.map((assignment) => this.toAssignment(assignment)) };
  }

  async studentLearningRecords(userId: string) {
    await this.ensureRole(userId, UserType.STUDENT);
    const records = await this.prisma.learningRecord.findMany({
      where: {
        studentId: userId,
        course: { deletedAt: null },
        courseware: { deletedAt: null },
      },
      orderBy: { updatedAt: 'desc' },
      include: this.learningRecordInclude(),
      take: 200,
    });

    return { records: records.map((record) => this.toLearningRecord(record)) };
  }

  async ensureTeacherClass(userId: string, classId: string) {
    await this.ensureRole(userId, UserType.TEACHER);
    const membership = await this.prisma.userClass.findUnique({
      where: {
        userId_classId: { userId, classId },
      },
    });

    if (!membership || membership.role !== ClassMemberRole.TEACHER) {
      throw new ForbiddenException('Teacher can only manage own classes');
    }

    return membership;
  }

  private async ensureRole(userId: string, userType: UserType) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.userType !== userType ||
      user.approvalStatus !== UserApprovalStatus.APPROVED
    ) {
      throw new ForbiddenException('Portal role is not allowed');
    }

    return user;
  }

  private async teacherClassIds(userId: string) {
    const memberships = await this.prisma.userClass.findMany({
      where: { userId, role: ClassMemberRole.TEACHER },
      select: { classId: true },
    });

    return memberships.map((membership) => membership.classId);
  }

  private async studentClassIds(userId: string) {
    const memberships = await this.prisma.userClass.findMany({
      where: { userId, role: ClassMemberRole.STUDENT },
      select: { classId: true },
    });

    return memberships.map((membership) => membership.classId);
  }

  private userContextInclude() {
    return {
      organizations: {
        include: {
          organization: true,
          role: true,
        },
      },
      classes: {
        include: {
          class: {
            include: {
              organization: true,
            },
          },
        },
      },
    } as const;
  }

  private assignmentInclude() {
    return {
      course: {
        include: {
          coursewares: {
            where: { status: CourseStatus.PUBLISHED, deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      },
      class: {
        include: {
          organization: true,
        },
      },
      teacher: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
      _count: {
        select: { learningRecords: true },
      },
    } satisfies Prisma.CourseAssignmentInclude;
  }

  private learningRecordInclude() {
    return {
      course: true,
      courseware: true,
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

  private toPortalUser(user: {
    id: string;
    username: string | null;
    email: string;
    displayName: string | null;
    userType: UserType;
    approvalStatus: UserApprovalStatus;
    ageBand: string | null;
    status: UserStatus;
    isPlatformAdmin: boolean;
    organizations: Array<{
      organization: {
        id: string;
        name: string;
        code: string | null;
        type: string;
      };
      role: {
        key: string;
        name: string;
        permissions: string[];
      } | null;
    }>;
    classes: Array<{
      class: {
        id: string;
        name: string;
        code: string | null;
        organization: {
          id: string;
          name: string;
        };
      };
      role: ClassMemberRole;
    }>;
  }) {
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        userType: user.userType,
        approvalStatus: user.approvalStatus,
        ageBand: user.ageBand,
        status: user.status,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      organizations: user.organizations.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        code: membership.organization.code,
        type: membership.organization.type,
        role: membership.role,
      })),
      classes: user.classes.map((membership) => ({
        id: membership.class.id,
        name: membership.class.name,
        code: membership.class.code,
        role: membership.role,
        organization: membership.class.organization,
      })),
    };
  }

  private toAssignment(assignment: {
    id: string;
    title: string;
    instructions: string | null;
    startAt: Date | null;
    dueAt: Date | null;
    status: CourseAssignmentStatus;
    createdAt: Date;
    course: {
      id: string;
      slug: string;
      title: string;
      description: string | null;
      runtimeType: string;
      entryUrl: string;
      status: CourseStatus;
      coursewares?: Array<{
        id: string;
        slug: string;
        title: string;
        description: string | null;
        sortOrder: number;
        runtimeType: string;
        entryUrl: string;
        status: CourseStatus;
      }>;
    };
    class: {
      id: string;
      name: string;
      code: string | null;
      organization: {
        id: string;
        name: string;
      };
    };
    teacher: {
      id: string;
      email: string;
      displayName: string | null;
    };
    _count?: {
      learningRecords: number;
    };
  }) {
    return {
      id: assignment.id,
      title: assignment.title,
      instructions: assignment.instructions,
      startAt: assignment.startAt,
      dueAt: assignment.dueAt,
      status: assignment.status,
      createdAt: assignment.createdAt,
      recordsCount: assignment._count?.learningRecords ?? 0,
      course: assignment.course,
      class: assignment.class,
      teacher: assignment.teacher,
    };
  }

  private toLearningRecord(record: {
    id: string;
    status: string;
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
    courseware: {
      id: string;
      slug: string;
      title: string;
      entryUrl: string;
      sortOrder: number;
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
      courseware: record.courseware,
      assignment: record.assignment,
      class: record.class,
      student: record.student,
    };
  }
}
