import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CourseAssignmentStatus,
  LearningRecordStatus,
  Prisma,
  UserApprovalStatus,
  UserType,
  WorkItemAudience,
  WorkItemStatus,
  WorkItemType,
} from '@prisma/client';
import { JwtUserPayload } from '../auth/types/jwt-payload';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(
    user: JwtUserPayload,
    status: WorkItemStatus = WorkItemStatus.PENDING,
  ) {
    await this.syncBacklogForUser(user);
    await this.archiveStaleLearningRecordWorkItems(user);

    const items = await this.prisma.workItem.findMany({
      where: {
        AND: [
          this.accessWhere(user),
          this.activeRelatedRecordsWhere(),
        ],
        status,
      },
      orderBy: { createdAt: 'desc' },
      include: this.includeRelations(),
      take: 1000,
    });

    return {
      items: items
        .filter((item) => this.isCurrentWorkItem(item))
        .slice(0, 80)
        .map((item) => this.toWorkItem(item)),
    };
  }

  async summaryForUser(user: JwtUserPayload) {
    await this.syncBacklogForUser(user);
    await this.archiveStaleLearningRecordWorkItems(user);

    const pendingItems = await this.prisma.workItem.findMany({
      where: {
        AND: [
          this.accessWhere(user),
          this.activeRelatedRecordsWhere(),
        ],
        status: WorkItemStatus.PENDING,
      },
      include: this.includeRelations(),
      take: 1000,
    });

    return { pendingCount: pendingItems.filter((item) => this.isCurrentWorkItem(item)).length };
  }

  async completeForUser(user: JwtUserPayload, id: string) {
    const item = await this.prisma.workItem.findFirst({
      where: {
        id,
        ...this.accessWhere(user),
      },
    });

    if (!item) {
      throw new NotFoundException('Work item not found');
    }

    const updated = await this.prisma.workItem.update({
      where: { id },
      data: {
        status: WorkItemStatus.DONE,
        completedAt: new Date(),
        completedByUserId: user.sub,
      },
      include: this.includeRelations(),
    });

    return this.toWorkItem(updated);
  }

  async createStudentRegistration(user: {
    id: string;
    email: string;
    displayName: string | null;
  }) {
    return this.upsertWorkItem({
      uniqueKey: `admin:student-registered:${user.id}`,
      type: WorkItemType.STUDENT_REGISTERED,
      audience: WorkItemAudience.ADMIN,
      title: `新学生注册：${user.displayName || user.email}`,
      description: user.email,
      actionLabel: '查看用户',
      sourceUserId: user.id,
    });
  }

  async createTeacherPendingApproval(user: {
    id: string;
    email: string;
    displayName: string | null;
  }) {
    return this.upsertWorkItem({
      uniqueKey: `admin:teacher-pending-approval:${user.id}`,
      type: WorkItemType.TEACHER_PENDING_APPROVAL,
      audience: WorkItemAudience.ADMIN,
      title: `教师待审核：${user.displayName || user.email}`,
      description: user.email,
      actionLabel: '去审核',
      sourceUserId: user.id,
    });
  }

  async createLearningRecordCompleted(recordId: string) {
    const record = await this.prisma.learningRecord.findUnique({
      where: { id: recordId },
      include: {
        student: true,
        course: true,
        courseware: true,
        assignment: {
          include: {
            teacher: true,
            class: { include: { organization: true } },
          },
        },
      },
    });

    if (!record || record.status !== LearningRecordStatus.COMPLETED) {
      return;
    }

    const studentName = record.student.displayName || record.student.email;
    const title = `${studentName} 提交了 ${record.courseware.title}`;
    const description = [
      record.course.title,
      record.assignment
        ? `${record.assignment.class.organization.name} / ${record.assignment.class.name}`
        : null,
      record.score === null || record.score === undefined ? null : `分数 ${record.score}`,
    ].filter(Boolean).join(' · ');

    await this.upsertWorkItem({
      uniqueKey: `admin:learning-record-completed:${record.id}`,
      type: WorkItemType.LEARNING_RECORD_COMPLETED,
      audience: WorkItemAudience.ADMIN,
      title,
      description,
      actionLabel: '查看提交',
      sourceUserId: record.studentId,
      courseId: record.courseId,
      coursewareId: record.coursewareId,
      assignmentId: record.assignmentId,
      learningRecordId: record.id,
      metadata: {
        score: record.score,
        durationSeconds: record.durationSeconds,
      },
    });

    if (record.assignment?.teacherId) {
      await this.upsertWorkItem({
        uniqueKey: `teacher:${record.assignment.teacherId}:learning-record-completed:${record.id}`,
        type: WorkItemType.LEARNING_RECORD_COMPLETED,
        audience: WorkItemAudience.TEACHER,
        recipientUserId: record.assignment.teacherId,
        title,
        description,
        actionLabel: '查看提交',
        sourceUserId: record.studentId,
        courseId: record.courseId,
        coursewareId: record.coursewareId,
        assignmentId: record.assignmentId,
        learningRecordId: record.id,
        metadata: {
          score: record.score,
          durationSeconds: record.durationSeconds,
        },
      });
    }
  }

  async createCoursewareDeploymentFailed(
    coursewareId: string,
    message: string | null,
  ) {
    const courseware = await this.prisma.courseware.findUnique({
      where: { id: coursewareId },
      include: { course: true },
    });

    if (!courseware) {
      return;
    }

    return this.upsertWorkItem({
      uniqueKey: `admin:courseware-deployment-failed:${courseware.id}`,
      type: WorkItemType.COURSEWARE_DEPLOYMENT_FAILED,
      audience: WorkItemAudience.ADMIN,
      title: `课件异常：${courseware.title}`,
      description: `${courseware.course.title}${message ? ` · ${message}` : ''}`,
      actionLabel: '查看课件',
      courseId: courseware.courseId,
      coursewareId: courseware.id,
      metadata: {
        deploymentStatus: courseware.deploymentStatus,
        deploymentMessage: message,
      },
      reopen: true,
    });
  }

  private async syncBacklogForUser(user: JwtUserPayload) {
    if (user.isPlatformAdmin) {
      await Promise.all([
        this.syncPendingTeachers(),
        this.syncRegisteredStudents(),
        this.syncAdminCompletedRecords(),
        this.syncFailedCoursewares(),
      ]);
      return;
    }

    if (user.userType === UserType.TEACHER) {
      await this.syncTeacherCompletedRecords(user.sub);
    }
  }

  private async syncPendingTeachers() {
    const teachers = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        userType: UserType.TEACHER,
        approvalStatus: UserApprovalStatus.PENDING,
      },
      take: 200,
    });

    await Promise.all(
      teachers.map((teacher) => this.createTeacherPendingApproval(teacher)),
    );
  }

  private async syncRegisteredStudents() {
    const students = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        userType: UserType.STUDENT,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    await Promise.all(
      students.map((student) => this.createStudentRegistration(student)),
    );
  }

  private async syncAdminCompletedRecords() {
    const records = await this.prisma.learningRecord.findMany({
      where: {
        status: LearningRecordStatus.COMPLETED,
        course: { deletedAt: null },
        courseware: { deletedAt: null },
        student: { deletedAt: null },
        OR: [
          { classId: null },
          { class: { deletedAt: null, organization: { deletedAt: null } } },
        ],
        AND: [
          {
            OR: [
              { assignmentId: null },
              {
                assignment: {
                  status: CourseAssignmentStatus.ACTIVE,
                  class: { deletedAt: null, organization: { deletedAt: null } },
                },
              },
            ],
          },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    await Promise.all(
      records.map((record) => this.createLearningRecordCompleted(record.id)),
    );
  }

  private async syncTeacherCompletedRecords(teacherId: string) {
    const records = await this.prisma.learningRecord.findMany({
      where: {
        status: LearningRecordStatus.COMPLETED,
        assignment: {
          is: {
            teacherId,
            status: CourseAssignmentStatus.ACTIVE,
            class: { deletedAt: null, organization: { deletedAt: null } },
          },
        },
        course: { deletedAt: null },
        courseware: { deletedAt: null },
        student: { deletedAt: null },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    await Promise.all(
      records.map((record) => this.createLearningRecordCompleted(record.id)),
    );
  }

  private async syncFailedCoursewares() {
    const coursewares = await this.prisma.courseware.findMany({
      where: {
        deletedAt: null,
        deploymentStatus: { in: ['FAILED', 'STOPPED'] },
        course: { deletedAt: null },
      },
      take: 200,
    });

    await Promise.all(
      coursewares.map((courseware) =>
        this.createCoursewareDeploymentFailed(
          courseware.id,
          courseware.deploymentMessage,
        ),
      ),
    );
  }

  private accessWhere(user: JwtUserPayload): Prisma.WorkItemWhereInput {
    if (user.isPlatformAdmin) {
      return { audience: WorkItemAudience.ADMIN };
    }

    if (user.userType === UserType.TEACHER) {
      return {
        audience: WorkItemAudience.TEACHER,
        recipientUserId: user.sub,
      };
    }

    throw new ForbiddenException('No work item access');
  }

  private activeRelatedRecordsWhere(): Prisma.WorkItemWhereInput {
    const activeAssignment: Prisma.CourseAssignmentWhereInput = {
      status: CourseAssignmentStatus.ACTIVE,
      course: { deletedAt: null },
      class: { deletedAt: null, organization: { deletedAt: null } },
      teacher: { deletedAt: null },
    };

    return {
      AND: [
        {
          OR: [
            { sourceUserId: null },
            { sourceUser: { is: { deletedAt: null } } },
          ],
        },
        {
          OR: [
            { courseId: null },
            { course: { is: { deletedAt: null } } },
          ],
        },
        {
          OR: [
            { coursewareId: null },
            {
              courseware: {
                is: { deletedAt: null, course: { deletedAt: null } },
              },
            },
          ],
        },
        {
          OR: [
            { assignmentId: null },
            { assignment: { is: activeAssignment } },
          ],
        },
        {
          OR: [
            { type: { not: WorkItemType.LEARNING_RECORD_COMPLETED } },
            {
              AND: [
                { learningRecordId: { not: null } },
                { learningRecord: { isNot: null } },
              ],
            },
          ],
        },
        {
          OR: [
            { learningRecordId: null },
            {
              learningRecord: {
                is: {
                  student: { deletedAt: null },
                  course: { deletedAt: null },
                  courseware: { deletedAt: null, course: { deletedAt: null } },
                  AND: [
                    {
                      OR: [
                        { classId: null },
                        {
                          class: {
                            is: {
                              deletedAt: null,
                              organization: { deletedAt: null },
                            },
                          },
                        },
                      ],
                    },
                    {
                      OR: [
                        { assignmentId: null },
                        { assignment: { is: activeAssignment } },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    };
  }

  private async archiveStaleLearningRecordWorkItems(user: JwtUserPayload) {
    const candidates = await this.prisma.workItem.findMany({
      where: {
        ...this.accessWhere(user),
        status: WorkItemStatus.PENDING,
        type: WorkItemType.LEARNING_RECORD_COMPLETED,
      },
      include: this.includeRelations(),
      take: 1000,
    });

    const staleItemIds = candidates
      .filter((item) => !this.isCurrentWorkItem(item))
      .map((item) => item.id);

    if (!staleItemIds.length) {
      return;
    }

    await this.prisma.workItem.updateMany({
      where: { id: { in: staleItemIds } },
      data: {
        status: WorkItemStatus.DONE,
        completedAt: new Date(),
      },
    });
  }

  private upsertWorkItem(input: {
    uniqueKey: string;
    type: WorkItemType;
    audience: WorkItemAudience;
    title: string;
    description?: string | null;
    actionLabel?: string | null;
    recipientUserId?: string | null;
    sourceUserId?: string | null;
    courseId?: string | null;
    coursewareId?: string | null;
    assignmentId?: string | null;
    learningRecordId?: string | null;
    metadata?: Prisma.InputJsonValue;
    reopen?: boolean;
  }) {
    const data: Prisma.WorkItemUncheckedCreateInput = {
      uniqueKey: input.uniqueKey,
      type: input.type,
      audience: input.audience,
      title: input.title,
      description: input.description,
      actionLabel: input.actionLabel,
      recipientUserId: input.recipientUserId,
      sourceUserId: input.sourceUserId,
      courseId: input.courseId,
      coursewareId: input.coursewareId,
      assignmentId: input.assignmentId,
      learningRecordId: input.learningRecordId,
      metadata: input.metadata,
    };

    return this.prisma.workItem.upsert({
      where: { uniqueKey: input.uniqueKey },
      create: data,
      update: {
        title: input.title,
        description: input.description,
        actionLabel: input.actionLabel,
        metadata: input.metadata,
        ...(input.reopen
          ? {
              status: WorkItemStatus.PENDING,
              completedAt: null,
              completedByUserId: null,
            }
          : {}),
      },
    });
  }

  private includeRelations() {
    return {
      sourceUser: true,
      recipientUser: true,
      completedByUser: true,
      course: true,
      courseware: true,
      assignment: {
        include: {
          class: { include: { organization: true, members: true } },
          teacher: true,
        },
      },
      learningRecord: {
        include: {
          student: true,
          course: true,
          courseware: true,
          assignment: {
            include: {
              class: { include: { organization: true, members: true } },
              teacher: true,
            },
          },
          class: { include: { organization: true, members: true } },
        },
      },
    } satisfies Prisma.WorkItemInclude;
  }

  private isCurrentWorkItem(
    item: Prisma.WorkItemGetPayload<{
      include: ReturnType<WorkItemsService['includeRelations']>;
    }>,
  ) {
    const record = item.learningRecord;

    if (!record) {
      return item.type !== WorkItemType.LEARNING_RECORD_COMPLETED;
    }

    if (record.class && !this.classHasStudent(record.class, record.studentId)) {
      return false;
    }

    if (
      record.assignment &&
      !this.classHasStudent(record.assignment.class, record.studentId)
    ) {
      return false;
    }

    if (this.hasStaleLearningRecordContext(item, record)) {
      return false;
    }

    return true;
  }

  private hasStaleLearningRecordContext(
    item: Prisma.WorkItemGetPayload<{
      include: ReturnType<WorkItemsService['includeRelations']>;
    }>,
    record: NonNullable<
      Prisma.WorkItemGetPayload<{
        include: ReturnType<WorkItemsService['includeRelations']>;
      }>['learningRecord']
    >,
  ) {
    if (item.type !== WorkItemType.LEARNING_RECORD_COMPLETED) {
      return false;
    }

    const contextUpdatedAt = [
      record.class?.updatedAt,
      record.class?.organization.updatedAt,
      record.assignment?.class.updatedAt,
      record.assignment?.class.organization.updatedAt,
    ].filter((date): date is Date => Boolean(date));

    const itemCreatedAt = item.createdAt.getTime();
    const recordUpdatedAt = record.updatedAt.getTime();

    if (
      contextUpdatedAt.some((updatedAt) => {
        const updatedTime = updatedAt.getTime();
        return updatedTime > itemCreatedAt || updatedTime > recordUpdatedAt;
      })
    ) {
      return true;
    }

    return (
      item.title !== this.currentLearningRecordTitle(record) ||
      item.description !== this.currentLearningRecordDescription(record)
    );
  }

  private currentLearningRecordTitle(
    record: NonNullable<
      Prisma.WorkItemGetPayload<{
        include: ReturnType<WorkItemsService['includeRelations']>;
      }>['learningRecord']
    >,
  ) {
    const studentName = record.student.displayName || record.student.email;
    return `${studentName} 提交了 ${record.courseware.title}`;
  }

  private currentLearningRecordDescription(
    record: NonNullable<
      Prisma.WorkItemGetPayload<{
        include: ReturnType<WorkItemsService['includeRelations']>;
      }>['learningRecord']
    >,
  ) {
    return [
      record.course.title,
      record.assignment
        ? `${record.assignment.class.organization.name} / ${record.assignment.class.name}`
        : null,
      record.score === null || record.score === undefined ? null : `分数 ${record.score}`,
    ].filter(Boolean).join(' · ');
  }

  private classHasStudent(
    classRecord: {
      members: Array<{ userId: string; role: string }>;
    },
    studentId: string,
  ) {
    return classRecord.members.some(
      (member) => member.userId === studentId && member.role === 'STUDENT',
    );
  }

  private toWorkItem(
    item: Prisma.WorkItemGetPayload<{
      include: ReturnType<WorkItemsService['includeRelations']>;
    }>,
  ) {
    return {
      id: item.id,
      type: item.type,
      audience: item.audience,
      status: item.status,
      title: item.title,
      description: item.description,
      actionLabel: item.actionLabel,
      metadata: item.metadata,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      completedAt: item.completedAt,
      sourceUser: item.sourceUser
        ? {
            id: item.sourceUser.id,
            email: item.sourceUser.email,
            displayName: item.sourceUser.displayName,
            userType: item.sourceUser.userType,
            approvalStatus: item.sourceUser.approvalStatus,
            ageBand: item.sourceUser.ageBand,
          }
        : null,
      course: item.course
        ? {
            id: item.course.id,
            slug: item.course.slug,
            title: item.course.title,
            status: item.course.status,
          }
        : null,
      courseware: item.courseware
        ? {
            id: item.courseware.id,
            slug: item.courseware.slug,
            title: item.courseware.title,
            status: item.courseware.status,
            deploymentStatus: item.courseware.deploymentStatus,
            deploymentMessage: item.courseware.deploymentMessage,
          }
        : null,
      assignment: item.assignment
        ? {
            id: item.assignment.id,
            title: item.assignment.title,
            class: {
              id: item.assignment.class.id,
              name: item.assignment.class.name,
              organization: {
                id: item.assignment.class.organization.id,
                name: item.assignment.class.organization.name,
              },
            },
            teacher: {
              id: item.assignment.teacher.id,
              email: item.assignment.teacher.email,
              displayName: item.assignment.teacher.displayName,
            },
          }
        : null,
      learningRecord: item.learningRecord
        ? {
            id: item.learningRecord.id,
            status: item.learningRecord.status,
            score: item.learningRecord.score,
            durationSeconds: item.learningRecord.durationSeconds,
            summary: item.learningRecord.summary,
            startedAt: item.learningRecord.startedAt,
            completedAt: item.learningRecord.completedAt,
            createdAt: item.learningRecord.createdAt,
            updatedAt: item.learningRecord.updatedAt,
            student: {
              id: item.learningRecord.student.id,
              email: item.learningRecord.student.email,
              displayName: item.learningRecord.student.displayName,
              ageBand: item.learningRecord.student.ageBand,
            },
            course: {
              id: item.learningRecord.course.id,
              slug: item.learningRecord.course.slug,
              title: item.learningRecord.course.title,
              entryUrl: item.learningRecord.course.entryUrl,
            },
            courseware: {
              id: item.learningRecord.courseware.id,
              slug: item.learningRecord.courseware.slug,
              title: item.learningRecord.courseware.title,
              entryUrl: item.learningRecord.courseware.entryUrl,
              sortOrder: item.learningRecord.courseware.sortOrder,
            },
            assignment: item.learningRecord.assignment
              ? {
                  id: item.learningRecord.assignment.id,
                  title: item.learningRecord.assignment.title,
                }
              : null,
            class: item.learningRecord.class
              ? {
                  id: item.learningRecord.class.id,
                  name: item.learningRecord.class.name,
                  organization: {
                    id: item.learningRecord.class.organization.id,
                    name: item.learningRecord.class.organization.name,
                  },
                }
              : null,
          }
        : null,
    };
  }
}
