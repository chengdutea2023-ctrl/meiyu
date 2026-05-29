import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApplicationStatus,
  UserApprovalStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { generateToken } from '../../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationAccessScopeDto } from './dto/update-application-access-scope.dto';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateApplicationDto) {
    const appId = dto.appId?.trim() ?? `app_${generateToken(8)}`;
    const existed = await this.prisma.application.findUnique({
      where: { appId },
    });

    if (existed) {
      throw new BadRequestException('Application appId already exists');
    }

    const appSecret = `sk_${generateToken(32)}`;
    const appSecretHash = await bcrypt.hash(appSecret, 12);
    const application = await this.prisma.application.create({
      data: {
        appId,
        appSecretHash,
        name: dto.name,
        description: dto.description,
        homeUrl: dto.homeUrl,
        allowedOrigins: dto.allowedOrigins ?? [],
        redirectUris: dto.redirectUris ?? [],
      },
    });

    return {
      ...this.toPublicApplication(application),
      appSecret,
      secretVisibleOnce: true,
    };
  }

  async findMany() {
    const applications = await this.prisma.application.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return applications.map((application) =>
      this.toPublicApplication(application),
    );
  }

  async findByAppId(appId: string) {
    const application = await this.prisma.application.findUnique({
      where: { appId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return this.toPublicApplication(application);
  }

  async findAccessScope(appId: string) {
    const application = await this.prisma.application.findUnique({
      where: { appId },
      select: {
        id: true,
        appId: true,
        name: true,
        organizationAccesses: {
          include: { organization: true },
          orderBy: { createdAt: 'desc' },
        },
        classAccesses: {
          include: {
            class: {
              include: { organization: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return {
      application: {
        id: application.id,
        appId: application.appId,
        name: application.name,
      },
      organizations: application.organizationAccesses.map((access) => ({
        id: access.organization.id,
        name: access.organization.name,
        code: access.organization.code,
        type: access.organization.type,
      })),
      classes: application.classAccesses.map((access) => ({
        id: access.class.id,
        name: access.class.name,
        code: access.class.code,
        organization: {
          id: access.class.organization.id,
          name: access.class.organization.name,
        },
      })),
    };
  }

  async updateAccessScope(appId: string, dto: UpdateApplicationAccessScopeDto) {
    const application = await this.prisma.application.findUnique({
      where: { appId },
      select: { id: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const organizationIds = Array.from(new Set(dto.organizationIds ?? []));
    const classIds = Array.from(new Set(dto.classIds ?? []));

    if (organizationIds.length > 0) {
      const count = await this.prisma.organization.count({
        where: { id: { in: organizationIds } },
      });

      if (count !== organizationIds.length) {
        throw new BadRequestException('Some organizations do not exist');
      }
    }

    if (classIds.length > 0) {
      const count = await this.prisma.class.count({
        where: { id: { in: classIds } },
      });

      if (count !== classIds.length) {
        throw new BadRequestException('Some classes do not exist');
      }
    }

    await this.prisma.$transaction([
      this.prisma.applicationOrganizationAccess.deleteMany({
        where: { applicationId: application.id },
      }),
      this.prisma.applicationClassAccess.deleteMany({
        where: { applicationId: application.id },
      }),
      this.prisma.applicationOrganizationAccess.createMany({
        data: organizationIds.map((organizationId) => ({
          applicationId: application.id,
          organizationId,
        })),
        skipDuplicates: true,
      }),
      this.prisma.applicationClassAccess.createMany({
        data: classIds.map((classId) => ({
          applicationId: application.id,
          classId,
        })),
        skipDuplicates: true,
      }),
    ]);

    return this.findAccessScope(appId);
  }

  async findUsers(appId: string, userType?: UserType) {
    const application = await this.prisma.application.findUnique({
      where: { appId },
      select: { id: true, appId: true, name: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (userType && !Object.values(UserType).includes(userType)) {
      throw new BadRequestException('Invalid userType');
    }

    const scope = await this.findAccessScope(appId);
    const organizationIds = scope.organizations.map((organization) => organization.id);
    const classIds = scope.classes.map((classItem) => classItem.id);

    if (organizationIds.length === 0 && classIds.length === 0) {
      return {
        application,
        scope,
        users: [],
      };
    }

    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        approvalStatus: UserApprovalStatus.APPROVED,
        ...(userType ? { userType } : {}),
        OR: [
          { organizations: { some: { organizationId: { in: organizationIds } } } },
          { classes: { some: { classId: { in: classIds } } } },
          { classes: { some: { class: { organizationId: { in: organizationIds } } } } },
        ],
      },
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
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return {
      application,
      scope,
      users: users.map((user) => ({
        id: user.id,
        appId: application.appId,
        platformUserId: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        userType: user.userType,
        approvalStatus: user.approvalStatus,
        ageBand: user.ageBand,
        status: user.status,
        createdAt: user.createdAt,
        organizations: user.organizations.map((membership) => ({
          id: membership.organization.id,
          name: membership.organization.name,
          code: membership.organization.code,
          type: membership.organization.type,
          role: membership.role
            ? {
                key: membership.role.key,
                name: membership.role.name,
              }
            : null,
        })),
        classes: user.classes.map((membership) => ({
          id: membership.class.id,
          name: membership.class.name,
          code: membership.class.code,
          role: membership.role,
          organization: {
            id: membership.class.organization.id,
            name: membership.class.organization.name,
          },
        })),
      })),
    };
  }

  async updateStatus(appId: string, status: ApplicationStatus) {
    const application = await this.prisma.application.update({
      where: { appId },
      data: { status },
    });

    return this.toPublicApplication(application);
  }

  private toPublicApplication(application: {
    id: string;
    appId: string;
    name: string;
    description: string | null;
    homeUrl: string;
    allowedOrigins: string[];
    redirectUris: string[];
    status: ApplicationStatus;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: application.id,
      appId: application.appId,
      name: application.name,
      description: application.description,
      homeUrl: application.homeUrl,
      allowedOrigins: application.allowedOrigins,
      redirectUris: application.redirectUris,
      status: application.status,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
  }
}
