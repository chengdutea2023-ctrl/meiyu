import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim();

    const existed = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existed) {
      throw new BadRequestException('Username or email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        displayName: dto.displayName,
        isPlatformAdmin: dto.isPlatformAdmin ?? false,
      },
    });

    return this.toPublicUser(user);
  }

  async findMany() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return users.map((user) => this.toPublicUser(user));
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
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
    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
    });

    return this.toPublicUser(user);
  }

  private toPublicUser(user: {
    id: string;
    username: string;
    email: string;
    displayName: string | null;
    status: UserStatus;
    isPlatformAdmin: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      isPlatformAdmin: user.isPlatformAdmin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

