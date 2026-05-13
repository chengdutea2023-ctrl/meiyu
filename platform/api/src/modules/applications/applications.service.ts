import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { generateToken } from '../../common/crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';

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

  async findUsers(appId: string, agentName?: string) {
    const application = await this.prisma.application.findUnique({
      where: { appId },
      select: { id: true, appId: true, name: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const normalizedAgentName = agentName?.trim();
    const users = await this.prisma.applicationUser.findMany({
      where: {
        applicationId: application.id,
        ...(normalizedAgentName ? { agentName: normalizedAgentName } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { lastSyncedAt: 'desc' },
      take: 200,
    });

    const agents = await this.prisma.applicationUser.groupBy({
      by: ['agentName'],
      where: {
        applicationId: application.id,
        agentName: { not: null },
      },
      _count: { agentName: true },
      orderBy: { agentName: 'asc' },
    });

    return {
      application,
      agents: agents.map((agent) => ({
        name: agent.agentName,
        userCount: agent._count.agentName,
      })),
      users: users.map((applicationUser) => ({
        id: applicationUser.id,
        appId: application.appId,
        externalUserId: applicationUser.externalUserId,
        platformUserId: applicationUser.userId,
        email: applicationUser.email,
        username: applicationUser.username,
        displayName: applicationUser.displayName,
        ageBand: applicationUser.ageBand,
        agentName: applicationUser.agentName,
        emailVerified: applicationUser.emailVerified,
        firstLinkedAt: applicationUser.firstLinkedAt,
        lastSyncedAt: applicationUser.lastSyncedAt,
        user: applicationUser.user,
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
