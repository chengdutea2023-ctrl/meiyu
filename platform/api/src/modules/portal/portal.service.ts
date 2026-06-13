import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ClassMemberRole,
  CourseAssignmentStatus,
  CourseTeachingStatus,
  CoursewareTeachingStatus,
  CourseStatus,
  Prisma,
  UserApprovalStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentScheduleDto } from './dto/update-assignment-schedule.dto';

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
    const assignments = await this.prisma.courseAssignment.findMany({
      where: {
        teacherId: userId,
        status: CourseAssignmentStatus.ACTIVE,
        course: { status: CourseStatus.PUBLISHED, deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        class: {
          include: {
            organization: true,
            members: {
              where: { role: ClassMemberRole.STUDENT, user: { deletedAt: null } },
              select: { id: true },
            },
            _count: { select: { courseAssignments: true } },
          },
        },
      },
      take: 200,
    });

    const classMap = new Map<string, (typeof assignments)[number]['class']>();
    for (const assignment of assignments) {
      if (!classMap.has(assignment.class.id)) {
        classMap.set(assignment.class.id, assignment.class);
      }
    }

    return {
      classes: Array.from(classMap.values()).map((classRecord) => ({
        id: classRecord.id,
        name: classRecord.name,
        code: classRecord.code,
        status: classRecord.status,
        organization: {
          id: classRecord.organization.id,
          name: classRecord.organization.name,
        },
        membersCount: classRecord.members.length,
        assignmentsCount: classRecord._count.courseAssignments,
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
    const assignments = await this.prisma.courseAssignment.findMany({
      where: {
        teacherId: userId,
        status: CourseAssignmentStatus.ACTIVE,
        course: { status: CourseStatus.PUBLISHED, deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        course: {
          include: {
            coursewareLinks: {
              where: { courseware: { status: CourseStatus.PUBLISHED, deletedAt: null } },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              include: { courseware: true },
            },
            _count: {
              select: {
                assignments: true,
                learningRecords: true,
                coursewareLinks: true,
              },
            },
          },
        },
      },
      take: 200,
    });

    const courseMap = new Map<string, ReturnType<typeof this.toPortalCourse>>();
    for (const assignment of assignments) {
      if (!courseMap.has(assignment.course.id)) {
        courseMap.set(assignment.course.id, this.toPortalCourse(assignment.course));
      }
    }

    return { courses: Array.from(courseMap.values()) };
  }

  async createTeacherAssignment(userId: string, _dto: CreateAssignmentDto) {
    await this.ensureRole(userId, UserType.TEACHER);
    throw new ForbiddenException('课程任务由平台管理员在业务底座后台布置');
  }

  async teacherAssignments(userId: string) {
    await this.ensureRole(userId, UserType.TEACHER);
    const assignments = await this.prisma.courseAssignment.findMany({
      where: {
        teacherId: userId,
        status: CourseAssignmentStatus.ACTIVE,
        course: { status: CourseStatus.PUBLISHED, deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      include: this.assignmentInclude(),
      take: 200,
    });

    return { assignments: assignments.map((assignment) => this.toAssignment(assignment)) };
  }

  async updateTeacherAssignmentSchedule(
    userId: string,
    assignmentId: string,
    dto: UpdateAssignmentScheduleDto,
  ) {
    await this.ensureRole(userId, UserType.TEACHER);
    const assignment = await this.prisma.courseAssignment.findFirst({
      where: {
        id: assignmentId,
        teacherId: userId,
        status: CourseAssignmentStatus.ACTIVE,
        course: { status: CourseStatus.PUBLISHED, deletedAt: null },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const startAt = new Date(dto.startAt);
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (Number.isNaN(startAt.getTime()) || (dueAt && Number.isNaN(dueAt.getTime()))) {
      throw new BadRequestException('计划时间格式无效');
    }

    if (dueAt && dueAt <= startAt) {
      throw new BadRequestException('计划结束时间必须晚于计划上课时间');
    }

    const updated = await this.prisma.courseAssignment.update({
      where: { id: assignment.id },
      data: { startAt, dueAt },
      include: this.assignmentInclude(),
    });

    return this.toAssignment(updated);
  }

  async openTeacherAssignment(userId: string, assignmentId: string) {
    await this.ensureRole(userId, UserType.TEACHER);
    const assignment = await this.prisma.courseAssignment.findFirst({
      where: {
        id: assignmentId,
        teacherId: userId,
        status: CourseAssignmentStatus.ACTIVE,
        course: { status: CourseStatus.PUBLISHED, deletedAt: null },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.ensureAssignmentCoursewareStates(assignment.id);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.courseAssignmentCoursewareState.updateMany({
        where: { assignmentId: assignment.id },
        data: {
          status: CoursewareTeachingStatus.CLOSED,
          closedAt: new Date(),
          closedByUserId: userId,
          openedAt: null,
          openedByUserId: null,
        },
      });

      return tx.courseAssignment.update({
        where: { id: assignment.id },
        data: {
          teachingStatus: CourseTeachingStatus.OPEN,
          openedAt: new Date(),
          openedByUserId: userId,
          closedAt: null,
          closedByUserId: null,
        },
        include: this.assignmentInclude(),
      });
    });

    return this.toAssignment(updated);
  }

  async closeTeacherAssignment(userId: string, assignmentId: string) {
    await this.ensureRole(userId, UserType.TEACHER);
    const assignment = await this.prisma.courseAssignment.findFirst({
      where: {
        id: assignmentId,
        teacherId: userId,
        status: CourseAssignmentStatus.ACTIVE,
        course: { status: CourseStatus.PUBLISHED, deletedAt: null },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (assignment.teachingStatus !== CourseTeachingStatus.OPEN) {
      throw new BadRequestException('Only open assignments can be closed');
    }

    await this.ensureAssignmentCoursewareStates(assignment.id);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.courseAssignmentCoursewareState.updateMany({
        where: { assignmentId: assignment.id },
        data: {
          status: CoursewareTeachingStatus.CLOSED,
          closedAt: new Date(),
          closedByUserId: userId,
        },
      });

      return tx.courseAssignment.update({
        where: { id: assignment.id },
        data: {
          teachingStatus: CourseTeachingStatus.ENDED,
          closedAt: new Date(),
          closedByUserId: userId,
        },
        include: this.assignmentInclude(),
      });
    });

    return this.toAssignment(updated);
  }

  async teacherAssignmentCoursewares(userId: string, assignmentId: string) {
    await this.ensureRole(userId, UserType.TEACHER);
    const assignment = await this.ensureTeacherAssignment(userId, assignmentId);
    const updated = await this.ensureAssignmentCoursewareStates(assignment.id);

    return { coursewares: this.toAssignment(updated).coursewareStates };
  }

  async openTeacherAssignmentCourseware(
    userId: string,
    assignmentId: string,
    coursewareId: string,
  ) {
    await this.ensureRole(userId, UserType.TEACHER);
    const assignment = await this.ensureTeacherAssignment(userId, assignmentId);

    if (assignment.teachingStatus !== CourseTeachingStatus.OPEN) {
      throw new BadRequestException('请先开始课程，再开放课件');
    }

    await this.ensureAssignmentCourseware(assignment.id, coursewareId);
    await this.prisma.courseAssignmentCoursewareState.upsert({
      where: {
        assignmentId_coursewareId: {
          assignmentId: assignment.id,
          coursewareId,
        },
      },
      create: {
        assignmentId: assignment.id,
        coursewareId,
        status: CoursewareTeachingStatus.OPEN,
        openedAt: new Date(),
        openedByUserId: userId,
        closedAt: null,
        closedByUserId: null,
      },
      update: {
        status: CoursewareTeachingStatus.OPEN,
        openedAt: new Date(),
        openedByUserId: userId,
        closedAt: null,
        closedByUserId: null,
      },
    });

    const updated = await this.ensureAssignmentCoursewareStates(assignment.id);
    return this.toAssignment(updated);
  }

  async closeTeacherAssignmentCourseware(
    userId: string,
    assignmentId: string,
    coursewareId: string,
  ) {
    await this.ensureRole(userId, UserType.TEACHER);
    const assignment = await this.ensureTeacherAssignment(userId, assignmentId);
    await this.ensureAssignmentCourseware(assignment.id, coursewareId);

    await this.prisma.courseAssignmentCoursewareState.upsert({
      where: {
        assignmentId_coursewareId: {
          assignmentId: assignment.id,
          coursewareId,
        },
      },
      create: {
        assignmentId: assignment.id,
        coursewareId,
        status: CoursewareTeachingStatus.CLOSED,
        closedAt: new Date(),
        closedByUserId: userId,
      },
      update: {
        status: CoursewareTeachingStatus.CLOSED,
        closedAt: new Date(),
        closedByUserId: userId,
      },
    });

    const updated = await this.ensureAssignmentCoursewareStates(assignment.id);
    return this.toAssignment(updated);
  }

  async teacherLearningRecords(
    userId: string,
    query: {
      classId?: string;
      assignmentId?: string;
      courseId?: string;
      coursewareId?: string;
      sort?: string;
    },
  ) {
    await this.ensureRole(userId, UserType.TEACHER);

    const orderBy =
      query.sort === 'score-desc'
        ? [{ score: 'desc' as const }, { updatedAt: 'desc' as const }]
        : [{ updatedAt: 'desc' as const }];

    const records = await this.prisma.learningRecord.findMany({
      where: {
        ...(query.coursewareId ? { coursewareId: query.coursewareId } : {}),
        assignment: {
          is: {
            teacherId: userId,
            ...(query.assignmentId ? { id: query.assignmentId } : {}),
            ...(query.classId ? { classId: query.classId } : {}),
            ...(query.courseId ? { courseId: query.courseId } : {}),
            status: CourseAssignmentStatus.ACTIVE,
          },
        },
        course: { deletedAt: null },
        courseware: { deletedAt: null },
        student: { deletedAt: null },
      },
      orderBy,
      include: this.learningRecordInclude(),
      take: 300,
    });

    return { records: records.map((record) => this.toLearningRecord(record)) };
  }

  async teacherAssignmentCoursewareRecords(
    userId: string,
    assignmentId: string,
    coursewareId: string,
    sort = 'score-desc',
  ) {
    await this.ensureTeacherAssignment(userId, assignmentId);
    await this.ensureAssignmentCourseware(assignmentId, coursewareId);

    return this.teacherLearningRecords(userId, {
      assignmentId,
      coursewareId,
      sort,
    });
  }

  async teacherLearningRecord(userId: string, recordId: string) {
    await this.ensureRole(userId, UserType.TEACHER);
    const record = await this.prisma.learningRecord.findFirst({
      where: {
        id: recordId,
        assignment: {
          is: {
            teacherId: userId,
            status: CourseAssignmentStatus.ACTIVE,
          },
        },
        course: { deletedAt: null },
        courseware: { deletedAt: null },
        student: { deletedAt: null },
      },
      include: this.learningRecordInclude(),
    });

    if (!record) {
      throw new NotFoundException('Learning record not found');
    }

    return this.toLearningRecord(record);
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

  async studentLearningRecord(userId: string, recordId: string) {
    await this.ensureRole(userId, UserType.STUDENT);
    const record = await this.prisma.learningRecord.findFirst({
      where: {
        id: recordId,
        studentId: userId,
        course: { deletedAt: null },
        courseware: { deletedAt: null },
      },
      include: this.learningRecordInclude(),
    });

    if (!record) {
      throw new NotFoundException('Learning record not found');
    }

    return this.toLearningRecord(record);
  }

  async ensureTeacherClass(userId: string, classId: string) {
    await this.ensureRole(userId, UserType.TEACHER);
    const assignment = await this.prisma.courseAssignment.findFirst({
      where: {
        teacherId: userId,
        classId,
        status: CourseAssignmentStatus.ACTIVE,
        course: { status: CourseStatus.PUBLISHED, deletedAt: null },
      },
    });

    if (!assignment) {
      throw new ForbiddenException('Teacher can only manage own classes');
    }

    return assignment;
  }

  private async ensureTeacherAssignment(userId: string, assignmentId: string) {
    const assignment = await this.prisma.courseAssignment.findFirst({
      where: {
        id: assignmentId,
        teacherId: userId,
        status: CourseAssignmentStatus.ACTIVE,
        course: { status: CourseStatus.PUBLISHED, deletedAt: null },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }

  private async ensureAssignmentCourseware(assignmentId: string, coursewareId: string) {
    const assignment = await this.prisma.courseAssignment.findUnique({
      where: { id: assignmentId },
      select: { courseId: true },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const link = await this.prisma.courseCourseware.findFirst({
      where: {
        courseId: assignment.courseId,
        coursewareId,
        courseware: {
          status: CourseStatus.PUBLISHED,
          deletedAt: null,
        },
      },
    });

    if (!link) {
      throw new NotFoundException('Published courseware not found in this assignment');
    }

    return link;
  }

  private async ensureAssignmentCoursewareStates(assignmentId: string) {
    const assignment = await this.prisma.courseAssignment.findUnique({
      where: { id: assignmentId },
      include: this.assignmentInclude(),
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const coursewareIds = assignment.course.coursewareLinks.map((link) => link.courseware.id);
    const existingIds = new Set(assignment.coursewareStates.map((state) => state.coursewareId));
    const missingIds = coursewareIds.filter((id) => !existingIds.has(id));

    if (missingIds.length > 0) {
      await this.prisma.courseAssignmentCoursewareState.createMany({
        data: missingIds.map((coursewareId) => ({
          assignmentId: assignment.id,
          coursewareId,
          status: CoursewareTeachingStatus.CLOSED,
        })),
        skipDuplicates: true,
      });

      return this.prisma.courseAssignment.findUniqueOrThrow({
        where: { id: assignmentId },
        include: this.assignmentInclude(),
      });
    }

    return assignment;
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
          coursewareLinks: {
            where: { courseware: { status: CourseStatus.PUBLISHED, deletedAt: null } },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            include: { courseware: true },
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
      coursewareStates: true,
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
      artifacts: {
        orderBy: { createdAt: 'asc' },
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

  private toPortalCourse(course: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    runtimeType: string;
    entryUrl: string;
    status: CourseStatus;
    coursewareLinks?: Array<{
      sortOrder: number;
      courseware: {
        id: string;
        slug: string;
        title: string;
        description: string | null;
        sortOrder: number;
        runtimeType: string;
        entryUrl: string;
        status: CourseStatus;
      };
    }>;
    _count?: {
      assignments?: number;
      learningRecords?: number;
      coursewareLinks?: number;
    };
  }) {
    const { coursewareLinks, _count, ...rest } = course;
    const coursewares = (coursewareLinks ?? []).map((link) => ({
      ...link.courseware,
      sortOrder: link.sortOrder,
    }));

    return {
      ...rest,
      coursewares,
      _count: _count
        ? {
            ..._count,
            coursewares: coursewares.length,
          }
        : undefined,
    };
  }

  private toAssignment(assignment: {
    id: string;
    title: string;
    instructions: string | null;
    startAt: Date | null;
    dueAt: Date | null;
    status: CourseAssignmentStatus;
    teachingStatus: CourseTeachingStatus;
    openedAt: Date | null;
    closedAt: Date | null;
    openedByUserId: string | null;
    closedByUserId: string | null;
    createdAt: Date;
    coursewareStates?: Array<{
      id: string;
      assignmentId: string;
      coursewareId: string;
      status: CoursewareTeachingStatus;
      openedAt: Date | null;
      closedAt: Date | null;
      openedByUserId: string | null;
      closedByUserId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
    course: {
      id: string;
      slug: string;
      title: string;
      description: string | null;
      runtimeType: string;
      entryUrl: string;
      status: CourseStatus;
      coursewareLinks?: Array<{
        sortOrder: number;
        courseware: {
          id: string;
          slug: string;
          title: string;
          description: string | null;
          sortOrder: number;
          runtimeType: string;
          entryUrl: string;
          status: CourseStatus;
        };
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
    const stateMap = new Map(
      (assignment.coursewareStates ?? []).map((state) => [state.coursewareId, state]),
    );
    const coursewareStates = (assignment.course.coursewareLinks ?? []).map((link) => {
      const state = stateMap.get(link.courseware.id);
      return {
        id: state?.id ?? null,
        coursewareId: link.courseware.id,
        status: state?.status ?? CoursewareTeachingStatus.CLOSED,
        openedAt: state?.openedAt ?? null,
        closedAt: state?.closedAt ?? null,
        openedByUserId: state?.openedByUserId ?? null,
        closedByUserId: state?.closedByUserId ?? null,
        courseware: {
          ...link.courseware,
          sortOrder: link.sortOrder,
        },
      };
    });

    return {
      id: assignment.id,
      title: assignment.title,
      instructions: assignment.instructions,
      startAt: assignment.startAt,
      dueAt: assignment.dueAt,
      status: assignment.status,
      teachingStatus: assignment.teachingStatus,
      openedAt: assignment.openedAt,
      closedAt: assignment.closedAt,
      openedByUserId: assignment.openedByUserId,
      closedByUserId: assignment.closedByUserId,
      createdAt: assignment.createdAt,
      recordsCount: assignment._count?.learningRecords ?? 0,
      course: this.toPortalCourse(assignment.course),
      coursewareStates,
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
    artifacts?: Array<{
      id: string;
      kind: string;
      fileName: string;
      originalFileName: string;
      mimeType: string;
      sizeBytes: number;
      publicUrl: string;
      metadata: unknown;
      createdAt: Date;
    }>;
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
      artifacts: (record.artifacts ?? []).map((artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        fileName: artifact.fileName,
        originalFileName: artifact.originalFileName,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        url: artifact.publicUrl,
        metadata: artifact.metadata,
        createdAt: artifact.createdAt,
      })),
    };
  }
}
