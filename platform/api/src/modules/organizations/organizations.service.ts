import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClassMemberRole, OrganizationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddClassMemberDto } from './dto/add-class-member.dto';
import { AddOrganizationMemberDto } from './dto/add-organization-member.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto) {
    if (dto.code) {
      const existed = await this.prisma.organization.findUnique({
        where: { code: dto.code },
      });

      if (existed) {
        throw new BadRequestException('Organization code already exists');
      }
    }

    return this.prisma.organization.create({
      data: {
        name: dto.name,
        code: dto.code,
        type: dto.type ?? OrganizationType.SCHOOL,
      },
    });
  }

  async findMany() {
    return this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            classes: true,
            members: true,
          },
        },
      },
      take: 100,
    });
  }

  async findById(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        classes: {
          orderBy: { createdAt: 'desc' },
          include: {
            members: {
              where: { user: { deletedAt: null } },
              orderBy: { createdAt: 'desc' },
              include: {
                user: true,
              },
            },
          },
        },
        members: {
          where: { user: { deletedAt: null } },
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
      orderBy: { createdAt: 'desc' },
      include: {
        organization: true,
        members: {
          where: { user: { deletedAt: null } },
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

    return this.prisma.class.create({
      data: {
        organizationId,
        name: dto.name,
        code: dto.code,
      },
    });
  }

  async addOrganizationMember(
    organizationId: string,
    dto: AddOrganizationMemberDto,
  ) {
    await this.ensureOrganization(organizationId);
    await this.ensureUser(dto.userId);

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
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
    });

    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }

    await this.ensureUser(dto.userId);

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
        role: dto.role ?? ClassMemberRole.STUDENT,
      },
      update: {
        role: dto.role ?? ClassMemberRole.STUDENT,
      },
    });
  }

  async removeClassMember(classId: string, userId: string) {
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
    const organization = await this.prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
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
}
