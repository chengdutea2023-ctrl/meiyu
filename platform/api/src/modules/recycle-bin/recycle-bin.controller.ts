import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('recycle-bin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('recycle-bin')
export class RecycleBinController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: '管理员查看回收站中的用户、课程、课件、机构和班级' })
  async findMany() {
    const [users, courses, coursewares, organizations, classes] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          deletedAt: { not: null },
          userType: { in: [UserType.STUDENT, UserType.TEACHER] },
        },
        orderBy: { deletedAt: 'desc' },
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          userType: true,
          approvalStatus: true,
          ageBand: true,
          status: true,
          isPlatformAdmin: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
        take: 200,
      }),
      this.prisma.course.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        include: {
          createdByUser: {
            select: {
              id: true,
              email: true,
              displayName: true,
              userType: true,
            },
          },
          _count: {
            select: {
              assignments: true,
              learningRecords: true,
              coursewares: true,
            },
          },
        },
        take: 200,
      }),
      this.prisma.courseware.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        include: {
          course: true,
          _count: {
            select: {
              learningRecords: true,
              launchSessions: true,
            },
          },
        },
        take: 300,
      }),
      this.prisma.organization.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        include: {
          _count: {
            select: {
              classes: true,
              members: true,
            },
          },
        },
        take: 200,
      }),
      this.prisma.class.findMany({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              code: true,
              type: true,
              deletedAt: true,
            },
          },
          _count: {
            select: {
              courseAssignments: true,
              learningRecords: true,
              members: true,
            },
          },
        },
        take: 300,
      }),
    ]);

    return { users, courses, coursewares, organizations, classes };
  }
}
