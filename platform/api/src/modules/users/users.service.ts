import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClassMemberRole, UserApprovalStatus, UserStatus, UserType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ImportStudentsDto } from './dto/import-students.dto';
import { ReplaceStudentMembershipDto } from './dto/replace-student-membership.dto';

type ImportStudentRowResult = {
  rowNumber: number;
  email: string;
  displayName: string;
  ageBand: string | null;
  status: 'CREATED' | 'EXISTING_ADDED' | 'RESTORED_ADDED' | 'FAILED';
  reason: string | null;
  userId: string | null;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username?.trim() || undefined;
    const isPlatformAdmin = dto.isPlatformAdmin ?? false;
    const userType = isPlatformAdmin ? UserType.ADMIN : dto.userType ?? UserType.STUDENT;

    const existed = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email },
          ...(username ? [{ username }] : []),
        ],
      },
    });

    if (existed) {
      throw new BadRequestException(
        existed.deletedAt
          ? '账号已在回收站，请先恢复或永久删除后再创建'
          : 'Username or email already exists',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        displayName: dto.displayName,
        userType,
        approvalStatus: dto.approvalStatus ?? UserApprovalStatus.APPROVED,
        ageBand: dto.ageBand,
        isPlatformAdmin,
      },
    });

    return this.toPublicUser(user);
  }

  async findMany() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
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
      },
      take: 100,
    });

    return users.map((user) => this.toUserWithMemberships(user));
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
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
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toUserWithMemberships(user);
  }

  async replaceStudentMembership(id: string, dto: ReplaceStudentMembershipDto) {
    const user = await this.ensureUserAvailable(id);
    if (user.userType !== UserType.STUDENT) {
      throw new BadRequestException('只有学生账号可以分配学校和班级');
    }

    const organization = await this.prisma.organization.findFirst({
      where: { id: dto.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    let classRecord: { id: string } | null = null;
    if (dto.classId) {
      classRecord = await this.prisma.class.findFirst({
        where: {
          id: dto.classId,
          organizationId: organization.id,
          deletedAt: null,
          organization: { deletedAt: null },
        },
        select: { id: true },
      });
      if (!classRecord) {
        throw new BadRequestException('班级不存在或不属于所选学校');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userClass.deleteMany({ where: { userId: id } });
      await tx.userOrganization.deleteMany({ where: { userId: id } });

      await tx.userOrganization.create({
        data: { userId: id, organizationId: organization.id },
      });

      if (classRecord) {
        await tx.userClass.create({
          data: {
            userId: id,
            classId: classRecord.id,
            role: ClassMemberRole.STUDENT,
          },
        });
      }
    });

    return this.findById(id);
  }

  async importStudents(dto: ImportStudentsDto) {
    const classRecord = await this.prisma.class.findFirst({
      where: {
        id: dto.classId,
        deletedAt: null,
        organization: { deletedAt: null },
      },
      include: { organization: true },
    });

    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }

    const normalizedRows = dto.students.map((student, index) => ({
      rowNumber: student.rowNumber ?? index + 2,
      email: student.email?.trim().toLowerCase() ?? '',
      displayName: student.displayName?.trim() ?? '',
      ageBand: student.ageBand?.trim() || null,
    }));
    const passwordHash = await bcrypt.hash(dto.defaultPassword, 12);
    const seenEmails = new Set<string>();
    const results: ImportStudentRowResult[] = [];

    for (const row of normalizedRows) {
      if (!row.displayName) {
        results.push(this.importStudentFailure(row, '学生姓名不能为空'));
        continue;
      }

      if (!row.email || !this.isValidEmail(row.email)) {
        results.push(this.importStudentFailure(row, '邮箱格式不正确'));
        continue;
      }

      if (seenEmails.has(row.email)) {
        results.push(this.importStudentFailure(row, '表格内重复邮箱'));
        continue;
      }
      seenEmails.add(row.email);

      const existed = await this.prisma.user.findUnique({
        where: { email: row.email },
      });

      if (existed && existed.userType !== UserType.STUDENT) {
        results.push(this.importStudentFailure(row, '该邮箱已属于老师或管理员账号'));
        continue;
      }

      const wasDeleted = Boolean(existed?.deletedAt);

      try {
        const user = existed
          ? await this.addImportedStudentToClass(existed.id, classRecord.organizationId, classRecord.id, {
              restore: wasDeleted,
            })
          : await this.createImportedStudent(row, passwordHash, classRecord.organizationId, classRecord.id);

        results.push({
          ...row,
          status: wasDeleted ? 'RESTORED_ADDED' : existed ? 'EXISTING_ADDED' : 'CREATED',
          reason: wasDeleted
            ? '学生已从回收站恢复，并加入所选班级'
            : existed
              ? '学生已存在，已更新到所选班级'
              : null,
          userId: user.id,
        });
      } catch (error) {
        results.push(
          this.importStudentFailure(
            row,
            error instanceof Error ? error.message : '导入失败',
          ),
        );
      }
    }

    const createdCount = results.filter((result) => result.status === 'CREATED').length;
    const restoredCount = results.filter((result) => result.status === 'RESTORED_ADDED').length;
    const existingAddedCount = results.filter((result) => result.status === 'EXISTING_ADDED').length;
    const failedCount = results.filter((result) => result.status === 'FAILED').length;

    return {
      class: {
        id: classRecord.id,
        name: classRecord.name,
        organization: {
          id: classRecord.organization.id,
          name: classRecord.organization.name,
        },
      },
      createdCount,
      restoredCount,
      existingAddedCount,
      failedCount,
      results,
    };
  }

  private toUserWithMemberships(user: {
    id: string;
    username: string | null;
    email: string;
    displayName: string | null;
    userType: UserType;
    approvalStatus: UserApprovalStatus;
    ageBand: string | null;
    status: UserStatus;
    isPlatformAdmin: boolean;
    createdAt: Date;
    updatedAt: Date;
    organizations: Array<{
      organization: {
        id: string;
        name: string;
        code: string | null;
      };
      role: {
        key: string;
      } | null;
    }>;
    classes: Array<{
      class: {
        id: string;
        name: string;
        organization: {
          id: string;
          name: string;
        };
      };
      role: string;
    }>;
  }) {
    return {
      ...this.toPublicUser(user),
      organizations: user.organizations.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        code: membership.organization.code,
        role: membership.role?.key ?? null,
      })),
      classes: user.classes.map((membership) => ({
        id: membership.class.id,
        name: membership.class.name,
        role: membership.role,
        organization: {
          id: membership.class.organization.id,
          name: membership.class.organization.name,
        },
      })),
    };
  }

  async updateStatus(id: string, status: UserStatus) {
    await this.ensureUserAvailable(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
    });

    return this.toPublicUser(user);
  }

  private async createImportedStudent(
    row: { email: string; displayName: string; ageBand: string | null },
    passwordHash: string,
    organizationId: string,
    classId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: row.email,
          passwordHash,
          displayName: row.displayName,
          userType: UserType.STUDENT,
          approvalStatus: UserApprovalStatus.APPROVED,
          ageBand: row.ageBand,
        },
      });

      await tx.userOrganization.upsert({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId,
          },
        },
        create: {
          userId: user.id,
          organizationId,
        },
        update: {},
      });

      await tx.userClass.upsert({
        where: {
          userId_classId: {
            userId: user.id,
            classId,
          },
        },
        create: {
          userId: user.id,
          classId,
          role: ClassMemberRole.STUDENT,
        },
        update: {
          role: ClassMemberRole.STUDENT,
        },
      });

      return user;
    });
  }

  private async addImportedStudentToClass(
    userId: string,
    organizationId: string,
    classId: string,
    options?: { restore?: boolean },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = options?.restore
        ? await tx.user.update({
            where: { id: userId },
            data: {
              deletedAt: null,
              status: UserStatus.ACTIVE,
            },
          })
        : await tx.user.findUniqueOrThrow({ where: { id: userId } });

      await tx.userClass.deleteMany({ where: { userId } });
      await tx.userOrganization.deleteMany({ where: { userId } });

      await tx.userOrganization.create({
        data: {
          userId,
          organizationId,
        },
      });

      await tx.userClass.create({
        data: {
          userId,
          classId,
          role: ClassMemberRole.STUDENT,
        },
      });

      return user;
    });
  }

  private importStudentFailure(
    row: { rowNumber: number; email: string; displayName: string; ageBand: string | null },
    reason: string,
  ): ImportStudentRowResult {
    return {
      ...row,
      status: 'FAILED',
      reason,
      userId: null,
    };
  }

  private isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async updateApproval(id: string, approvalStatus: UserApprovalStatus) {
    await this.ensureUserAvailable(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { approvalStatus },
    });

    return this.toPublicUser(user);
  }

  async resetPassword(id: string, password: string) {
    const user = await this.ensureUserAvailable(id);

    if (user.isPlatformAdmin || user.userType === UserType.ADMIN) {
      throw new BadRequestException('Platform admin password cannot be reset here');
    }

    if (user.userType !== UserType.TEACHER && user.userType !== UserType.STUDENT) {
      throw new BadRequestException('Only teacher and student passwords can be reset');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.authorizationCode.deleteMany({ where: { userId: user.id } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    ]);

    return this.toPublicUser(updated);
  }

  async moveToRecycleBin(id: string) {
    const user = await this.ensureDeletableUser(id);

    const deleted = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        deletedAt: new Date(),
        status: UserStatus.DISABLED,
      },
    });

    return this.toPublicUser(deleted);
  }

  async restore(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.deletedAt) {
      throw new NotFoundException('Deleted user not found');
    }

    if (user.isPlatformAdmin || user.userType === UserType.ADMIN) {
      throw new BadRequestException('Platform admin cannot be restored from recycle bin');
    }

    const restored = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
    });

    return this.toPublicUser(restored);
  }

  async permanentlyDelete(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || !user.deletedAt) {
      throw new NotFoundException('Deleted user not found');
    }

    if (user.isPlatformAdmin || user.userType === UserType.ADMIN) {
      throw new BadRequestException('Platform admin cannot be permanently deleted');
    }

    await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.authorizationCode.deleteMany({ where: { userId: user.id } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.applicationUser.deleteMany({ where: { userId: user.id } }),
      this.prisma.userClass.deleteMany({ where: { userId: user.id } }),
      this.prisma.userOrganization.deleteMany({ where: { userId: user.id } }),
      this.prisma.courseLaunchSession.deleteMany({ where: { studentId: user.id } }),
      this.prisma.learningRecord.deleteMany({ where: { studentId: user.id } }),
      this.prisma.courseAssignment.deleteMany({ where: { teacherId: user.id } }),
      this.prisma.user.delete({ where: { id: user.id } }),
    ]);

    return { id: user.id, deleted: true };
  }

  private async ensureUserAvailable(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async ensureDeletableUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isPlatformAdmin || user.userType === UserType.ADMIN) {
      throw new BadRequestException('Platform admin cannot be deleted');
    }

    return user;
  }

  private toPublicUser(user: {
    id: string;
    username: string | null;
    email: string;
    displayName: string | null;
    userType: UserType;
    approvalStatus: UserApprovalStatus;
    ageBand: string | null;
    status: UserStatus;
    isPlatformAdmin: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
  }) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      userType: user.userType,
      approvalStatus: user.approvalStatus,
      ageBand: user.ageBand,
      status: user.status,
      isPlatformAdmin: user.isPlatformAdmin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt ?? null,
    };
  }
}
