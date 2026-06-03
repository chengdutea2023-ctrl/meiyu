import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserApprovalStatus, UserStatus, UserType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

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

  async updateApproval(id: string, approvalStatus: UserApprovalStatus) {
    await this.ensureUserAvailable(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { approvalStatus },
    });

    return this.toPublicUser(user);
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
