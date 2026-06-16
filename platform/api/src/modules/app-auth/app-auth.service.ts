import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Application,
  ApplicationStatus,
  UserApprovalStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { SyncApplicationUserDto } from './dto/sync-application-user.dto';

@Injectable()
export class AppAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async syncUser(appId: string | undefined, appSecret: string | undefined, dto: SyncApplicationUserDto) {
    await this.verifyApplication(appId, appSecret);
    void dto;
    throw new ForbiddenException('Third-party user sync is disabled');
  }

  async findUsers(
    appId: string | undefined,
    appSecret: string | undefined,
    query: {
      userType?: UserType;
      organizationId?: string;
      classId?: string;
      limit?: string;
    },
  ) {
    const application = await this.verifyApplication(appId, appSecret);
    const scope = await this.getApplicationScope(application.id);

    if (query.userType && !Object.values(UserType).includes(query.userType)) {
      throw new BadRequestException('Invalid userType');
    }

    if (scope.organizationIds.length === 0 && scope.classIds.length === 0) {
      return { users: [] };
    }

    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200);
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        approvalStatus: UserApprovalStatus.APPROVED,
        ...(query.userType ? { userType: query.userType } : {}),
        ...(query.organizationId
          ? {
              OR: [
                {
                  organizations: {
                    some: {
                      organizationId: query.organizationId,
                      organization: { deletedAt: null },
                    },
                  },
                },
                {
                  classes: {
                    some: {
                      class: {
                        organizationId: query.organizationId,
                        deletedAt: null,
                        organization: { deletedAt: null },
                      },
                    },
                  },
                },
              ],
            }
          : {}),
        ...(query.classId
          ? {
              classes: {
                some: {
                  classId: query.classId,
                  class: { deletedAt: null, organization: { deletedAt: null } },
                },
              },
            }
          : {}),
        AND: [
          {
            OR: [
              {
                organizations: {
                  some: {
                    organizationId: { in: scope.organizationIds },
                    organization: { deletedAt: null },
                  },
                },
              },
              {
                classes: {
                  some: {
                    classId: { in: scope.classIds },
                    class: { deletedAt: null, organization: { deletedAt: null } },
                  },
                },
              },
              {
                classes: {
                  some: {
                    class: {
                      organizationId: { in: scope.organizationIds },
                      deletedAt: null,
                      organization: { deletedAt: null },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      include: this.userContextInclude(),
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      users: users.map((user) => this.toPlatformUserContext(user)),
    };
  }

  async findByEmail(appId: string | undefined, appSecret: string | undefined, rawEmail: string | undefined) {
    const application = await this.verifyApplication(appId, appSecret);
    const email = this.normalizeEmail(rawEmail);
    const scope = await this.getApplicationScope(application.id);

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: this.userContextInclude(),
    });

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.approvalStatus !== UserApprovalStatus.APPROVED ||
      !this.isUserInApplicationScope(user, scope)
    ) {
      throw new NotFoundException('User not found');
    }

    return this.toPlatformUserContext(user);
  }

  private userContextInclude() {
    return {
      organizations: {
        where: { organization: { deletedAt: null } },
        include: {
          organization: true,
          role: true,
        },
      },
      classes: {
        where: {
          class: {
            deletedAt: null,
            organization: { deletedAt: null },
          },
        },
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

  private toPlatformUserContext(user: {
    id: string;
    email: string;
    username: string | null;
    displayName: string | null;
    userType: UserType;
    ageBand: string | null;
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
      role: string;
      class: {
        id: string;
        name: string;
        code: string | null;
        organization: {
          id: string;
          name: string;
        };
      };
    }>;
  }) {
    return {
      platformUserId: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      userType: user.userType,
      ageBand: user.ageBand,
      organizations: user.organizations.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        code: membership.organization.code,
        type: membership.organization.type,
        role: membership.role
          ? {
              key: membership.role.key,
              name: membership.role.name,
              permissions: membership.role.permissions,
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
    };
  }

  private async getApplicationScope(applicationId: string) {
    const [organizationAccesses, classAccesses] = await Promise.all([
      this.prisma.applicationOrganizationAccess.findMany({
        where: { applicationId, organization: { deletedAt: null } },
        select: { organizationId: true },
      }),
      this.prisma.applicationClassAccess.findMany({
        where: {
          applicationId,
          class: {
            deletedAt: null,
            organization: { deletedAt: null },
          },
        },
        select: { classId: true },
      }),
    ]);

    return {
      organizationIds: organizationAccesses.map((access) => access.organizationId),
      classIds: classAccesses.map((access) => access.classId),
    };
  }

  private isUserInApplicationScope(
    user: {
      organizations: Array<{ organization: { id: string } }>;
      classes: Array<{ class: { id: string; organization: { id: string } } }>;
    },
    scope: { organizationIds: string[]; classIds: string[] },
  ) {
    const organizationIds = new Set(scope.organizationIds);
    const classIds = new Set(scope.classIds);

    return (
      user.organizations.some((membership) => organizationIds.has(membership.organization.id)) ||
      user.classes.some((membership) => classIds.has(membership.class.id)) ||
      user.classes.some((membership) => organizationIds.has(membership.class.organization.id))
    );
  }

  private async verifyApplication(appId: string | undefined, appSecret: string | undefined): Promise<Application> {
    const normalizedAppId = appId?.trim();
    const normalizedSecret = appSecret?.trim();

    if (!normalizedAppId || !normalizedSecret) {
      throw new UnauthorizedException('Invalid application credentials');
    }

    const application = await this.prisma.application.findUnique({
      where: { appId: normalizedAppId },
    });

    if (!application || application.status !== ApplicationStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid application credentials');
    }

    const secretMatches = await bcrypt.compare(normalizedSecret, application.appSecretHash);

    if (!secretMatches) {
      throw new UnauthorizedException('Invalid application credentials');
    }

    return application;
  }

  private normalizeEmail(email: string | undefined): string {
    const normalized = email?.trim().toLowerCase();

    if (!normalized) {
      throw new BadRequestException('email is required');
    }

    return normalized;
  }
}
