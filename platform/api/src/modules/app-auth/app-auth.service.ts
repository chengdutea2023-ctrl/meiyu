import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Application, ApplicationStatus, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { SyncApplicationUserDto } from './dto/sync-application-user.dto';

@Injectable()
export class AppAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async syncUser(appId: string | undefined, appSecret: string | undefined, dto: SyncApplicationUserDto) {
    const application = await this.verifyApplication(appId, appSecret);
    const email = this.normalizeEmail(dto.email);
    const externalUserId = dto.externalUserId.trim();
    const username = dto.username?.trim() || undefined;
    const displayName = dto.displayName?.trim() || undefined;
    const ageBand = dto.ageBand?.trim() || undefined;
    const agentName = dto.agentName?.trim() || undefined;
    const emailVerified = dto.emailVerified ?? false;

    if (!externalUserId) {
      throw new BadRequestException('externalUserId is required');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existingByExternalUserId = await tx.applicationUser.findUnique({
        where: {
          applicationId_externalUserId: {
            applicationId: application.id,
            externalUserId,
          },
        },
      });

      if (existingByExternalUserId && existingByExternalUserId.email !== email) {
        throw new ConflictException('externalUserId is already linked to another email');
      }

      const existingByEmail = await tx.applicationUser.findUnique({
        where: {
          applicationId_email: {
            applicationId: application.id,
            email,
          },
        },
      });

      if (existingByEmail && existingByEmail.externalUserId !== externalUserId) {
        throw new ConflictException('email belongs to another verified local user');
      }

      const existedUser = await tx.user.findUnique({
        where: { email },
      });

      if (existedUser?.status === UserStatus.DISABLED) {
        throw new BadRequestException('User is disabled');
      }

      const user =
        existedUser ??
        (await tx.user.create({
          data: {
            email,
            username: null,
            passwordHash: null,
            displayName,
            sourceApplicationId: application.id,
          },
        }));

      const created = !existedUser;

      if (!created && displayName && !user.displayName) {
        await tx.user.update({
          where: { id: user.id },
          data: { displayName },
        });
      }

      const applicationUser = await tx.applicationUser.upsert({
        where: {
          applicationId_externalUserId: {
            applicationId: application.id,
            externalUserId,
          },
        },
        update: {
          email,
          username,
          displayName,
          ageBand,
          agentName,
          emailVerified,
          userId: user.id,
        },
        create: {
          applicationId: application.id,
          userId: user.id,
          externalUserId,
          email,
          username,
          displayName,
          ageBand,
          agentName,
          emailVerified,
        },
      });

      return {
        user,
        applicationUser,
        created,
      };
    });

    const sourceAppId = await this.resolveSourceAppId(
      result.user.sourceApplicationId,
      application,
    );

    return {
      platformUserId: result.user.id,
      email: result.user.email,
      created: result.created,
      linked: true,
      sourceAppId,
      applicationUser: {
        appId: application.appId,
        externalUserId: result.applicationUser.externalUserId,
        username: result.applicationUser.username,
        displayName: result.applicationUser.displayName,
        ageBand: result.applicationUser.ageBand,
        agentName: result.applicationUser.agentName,
        emailVerified: result.applicationUser.emailVerified,
        firstLinkedAt: result.applicationUser.firstLinkedAt,
        lastSyncedAt: result.applicationUser.lastSyncedAt,
      },
    };
  }

  async findByEmail(appId: string | undefined, appSecret: string | undefined, rawEmail: string | undefined) {
    const application = await this.verifyApplication(appId, appSecret);
    const email = this.normalizeEmail(rawEmail);

    const applicationUser = await this.prisma.applicationUser.findUnique({
      where: {
        applicationId_email: {
          applicationId: application.id,
          email,
        },
      },
      include: {
        user: {
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
            sourceApplication: true,
          },
        },
      },
    });

    if (!applicationUser || applicationUser.user.status !== UserStatus.ACTIVE) {
      throw new NotFoundException('User not found');
    }

    const user = applicationUser.user;

    return {
      platformUserId: user.id,
      email: user.email,
      username: applicationUser.username ?? user.username,
      displayName: applicationUser.displayName ?? user.displayName,
      ageBand: applicationUser.ageBand,
      agentName: applicationUser.agentName,
      sourceAppId: user.sourceApplication?.appId ?? null,
      applicationUser: {
        appId: application.appId,
        externalUserId: applicationUser.externalUserId,
        ageBand: applicationUser.ageBand,
        agentName: applicationUser.agentName,
        emailVerified: applicationUser.emailVerified,
        firstLinkedAt: applicationUser.firstLinkedAt,
        lastSyncedAt: applicationUser.lastSyncedAt,
      },
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

  private async resolveSourceAppId(
    sourceApplicationId: string | null,
    currentApplication: Application,
  ): Promise<string | null> {
    if (!sourceApplicationId) {
      return null;
    }

    if (sourceApplicationId === currentApplication.id) {
      return currentApplication.appId;
    }

    const sourceApplication = await this.prisma.application.findUnique({
      where: { id: sourceApplicationId },
      select: { appId: true },
    });

    return sourceApplication?.appId ?? null;
  }

  private normalizeEmail(email: string | undefined): string {
    const normalized = email?.trim().toLowerCase();

    if (!normalized) {
      throw new BadRequestException('email is required');
    }

    return normalized;
  }
}
