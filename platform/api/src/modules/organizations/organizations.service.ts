import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClassMemberRole, OrganizationType, UserType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddClassMemberDto } from './dto/add-class-member.dto';
import { AddOrganizationMemberDto } from './dto/add-organization-member.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto) {
    const code = this.normalizeCode(dto.code);
    if (code) {
      const existed = await this.prisma.organization.findUnique({
        where: { code },
      });

      if (existed) {
        throw new BadRequestException('Organization code already exists');
      }
    }

    return this.prisma.organization.create({
      data: {
        name: dto.name.trim(),
        code,
        type: dto.type ?? OrganizationType.SCHOOL,
      },
    });
  }

  async findMany() {
    return this.prisma.organization.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            classes: { where: { deletedAt: null } },
            members: true,
          },
        },
      },
      take: 100,
    });
  }

  async findById(id: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
      include: {
        classes: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: {
            members: {
              where: { role: ClassMemberRole.STUDENT, user: { deletedAt: null } },
              orderBy: { createdAt: 'desc' },
              include: {
                user: true,
              },
            },
          },
        },
        members: {
          where: { user: { deletedAt: null, userType: UserType.STUDENT } },
          include: {
            user: true,
            role: true,
          },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return {
      ...organization,
      classes: organization.classes.map((classRecord) => ({
        ...classRecord,
        members: classRecord.members.map((membership) => ({
          id: membership.id,
          role: membership.role,
          user: {
            id: membership.user.id,
            username: membership.user.username ?? membership.user.email,
            email: membership.user.email,
            displayName: membership.user.displayName,
            userType: membership.user.userType,
          },
        })),
      })),
      members: organization.members.map((membership) => ({
        id: membership.id,
        user: {
          id: membership.user.id,
          username: membership.user.username ?? membership.user.email,
          email: membership.user.email,
          displayName: membership.user.displayName,
          userType: membership.user.userType,
        },
        role: membership.role
          ? {
              id: membership.role.id,
              key: membership.role.key,
              name: membership.role.name,
            }
          : null,
      })),
    };
  }

  async findClasses() {
    const classes = await this.prisma.class.findMany({
      where: {
        deletedAt: null,
        organization: { deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        organization: true,
        members: {
          where: { role: ClassMemberRole.STUDENT, user: { deletedAt: null } },
          orderBy: { createdAt: 'desc' },
          include: {
            user: true,
          },
        },
        _count: {
          select: {
            courseAssignments: true,
            members: true,
          },
        },
      },
      take: 300,
    });

    return classes.map((classRecord) => ({
      id: classRecord.id,
      name: classRecord.name,
      code: classRecord.code,
      status: classRecord.status,
      createdAt: classRecord.createdAt,
      organization: {
        id: classRecord.organization.id,
        name: classRecord.organization.name,
        code: classRecord.organization.code,
        type: classRecord.organization.type,
      },
      members: classRecord.members.map((membership) => ({
        id: membership.id,
        role: membership.role,
        user: {
          id: membership.user.id,
          username: membership.user.username ?? membership.user.email,
          email: membership.user.email,
          displayName: membership.user.displayName,
          userType: membership.user.userType,
          approvalStatus: membership.user.approvalStatus,
          status: membership.user.status,
        },
      })),
      _count: classRecord._count,
    }));
  }

  async createClass(organizationId: string, dto: CreateClassDto) {
    await this.ensureOrganization(organizationId);
    const code = this.normalizeCode(dto.code);
    if (code) {
      await this.ensureClassCodeAvailable(organizationId, code);
    }

    return this.prisma.class.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        code,
      },
    });
  }

  async updateOrganization(id: string, dto: UpdateOrganizationDto) {
    await this.ensureOrganization(id);

    const data: {
      name?: string;
      code?: string | null;
      type?: OrganizationType;
    } = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.type !== undefined) {
      data.type = dto.type;
    }
    if (dto.code !== undefined) {
      const code = this.normalizeCode(dto.code);
      if (code) {
        const existed = await this.prisma.organization.findUnique({
          where: { code },
        });
        if (existed && existed.id !== id) {
          throw new BadRequestException('Organization code already exists');
        }
      }
      data.code = code;
    }

    if (!Object.keys(data).length) {
      throw new BadRequestException('No organization fields to update');
    }

    return this.prisma.organization.update({
      where: { id },
      data,
    });
  }

  async moveOrganizationToRecycleBin(id: string) {
    const organization = await this.ensureOrganization(id);
    const deletedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id },
        data: { deletedAt },
      }),
      this.prisma.class.updateMany({
        where: { organizationId: organization.id, deletedAt: null },
        data: { deletedAt },
      }),
    ]);

    return { ...organization, deletedAt };
  }

  async restoreOrganization(id: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id, deletedAt: { not: null } },
    });

    if (!organization || !organization.deletedAt) {
      throw new NotFoundException('Organization not found in recycle bin');
    }

    await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id },
        data: { deletedAt: null },
      }),
      this.prisma.class.updateMany({
        where: {
          organizationId: id,
          deletedAt: organization.deletedAt,
        },
        data: { deletedAt: null },
      }),
    ]);

    return this.findById(id);
  }

  async permanentlyDeleteOrganization(id: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id, deletedAt: { not: null } },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found in recycle bin');
    }

    await this.prisma.organization.delete({ where: { id } });
    return { id, deleted: true };
  }

  async updateClass(classId: string, dto: UpdateClassDto) {
    const classRecord = await this.ensureActiveClass(classId);

    const data: {
      name?: string;
      code?: string | null;
    } = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.code !== undefined) {
      const code = this.normalizeCode(dto.code);
      if (code) {
        await this.ensureClassCodeAvailable(classRecord.organizationId, code, classId);
      }
      data.code = code;
    }

    if (!Object.keys(data).length) {
      throw new BadRequestException('No class fields to update');
    }

    return this.prisma.class.update({
      where: { id: classId },
      data,
    });
  }

  async moveClassToRecycleBin(classId: string) {
    await this.ensureActiveClass(classId);

    return this.prisma.class.update({
      where: { id: classId },
      data: { deletedAt: new Date() },
    });
  }

  async restoreClass(classId: string) {
    const classRecord = await this.prisma.class.findFirst({
      where: { id: classId, deletedAt: { not: null } },
      include: { organization: true },
    });

    if (!classRecord) {
      throw new NotFoundException('Class not found in recycle bin');
    }
    if (classRecord.organization.deletedAt) {
      throw new BadRequestException('请先恢复所属机构/学校，再恢复班级');
    }

    return this.prisma.class.update({
      where: { id: classId },
      data: { deletedAt: null },
    });
  }

  async permanentlyDeleteClass(classId: string) {
    const classRecord = await this.prisma.class.findFirst({
      where: { id: classId, deletedAt: { not: null } },
    });

    if (!classRecord) {
      throw new NotFoundException('Class not found in recycle bin');
    }

    await this.prisma.class.delete({ where: { id: classId } });
    return { id: classId, deleted: true };
  }

  async addOrganizationMember(
    organizationId: string,
    dto: AddOrganizationMemberDto,
  ) {
    await this.ensureOrganization(organizationId);
    const user = await this.ensureUser(dto.userId);
    if (user.userType !== UserType.STUDENT) {
      throw new BadRequestException('学校/机构成员只允许添加学生；教师请在排课时选择为负责老师');
    }

    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
      });

      if (!role) {
        throw new NotFoundException('Role not found');
      }
    }

    return this.prisma.userOrganization.upsert({
      where: {
        userId_organizationId: {
          userId: dto.userId,
          organizationId,
        },
      },
      create: {
        userId: dto.userId,
        organizationId,
        roleId: dto.roleId,
      },
      update: {
        roleId: dto.roleId,
      },
    });
  }

  async addClassMember(classId: string, dto: AddClassMemberDto) {
    await this.ensureActiveClass(classId);

    const user = await this.ensureUser(dto.userId);
    const role = dto.role ?? ClassMemberRole.STUDENT;
    if (role !== ClassMemberRole.STUDENT || user.userType !== UserType.STUDENT) {
      throw new BadRequestException('班级成员只允许添加学生；教师请在排课时选择为负责老师');
    }

    return this.prisma.userClass.upsert({
      where: {
        userId_classId: {
          userId: dto.userId,
          classId,
        },
      },
      create: {
        userId: dto.userId,
        classId,
        role,
      },
      update: {
        role,
      },
    });
  }

  async removeClassMember(classId: string, userId: string) {
    await this.ensureActiveClass(classId);

    const deleted = await this.prisma.userClass.deleteMany({
      where: {
        classId,
        userId,
      },
    });

    if (!deleted.count) {
      throw new NotFoundException('Class member not found');
    }

    return {
      classId,
      userId,
      removed: true,
    };
  }

  private async ensureOrganization(id: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  private async ensureActiveClass(id: string) {
    const classRecord = await this.prisma.class.findFirst({
      where: {
        id,
        deletedAt: null,
        organization: { deletedAt: null },
      },
    });

    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }

    return classRecord;
  }

  private async ensureClassCodeAvailable(
    organizationId: string,
    code: string,
    exceptClassId?: string,
  ) {
    const existed = await this.prisma.class.findFirst({
      where: {
        organizationId,
        code,
        ...(exceptClassId ? { NOT: { id: exceptClassId } } : {}),
      },
    });

    if (existed) {
      throw new BadRequestException('Class code already exists in this organization');
    }
  }

  private async ensureUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private normalizeCode(code?: string | null) {
    if (code === undefined) {
      return undefined;
    }

    const normalized = code?.trim();
    return normalized || null;
  }
}
