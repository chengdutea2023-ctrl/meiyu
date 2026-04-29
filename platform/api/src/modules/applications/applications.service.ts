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
        redirectUris: dto.redirectUris,
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
      redirectUris: application.redirectUris,
      status: application.status,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
  }
}

