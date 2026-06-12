import { BadRequestException, Injectable } from '@nestjs/common';
import { UserApprovalStatus, UserType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { WorkItemsService } from '../work-items/work-items.service';
import { RegisterStudentDto } from './dto/register-student.dto';
import { RegisterTeacherDto } from './dto/register-teacher.dto';

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workItems: WorkItemsService,
  ) {}

  registerStudent(dto: RegisterStudentDto) {
    return this.register({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
      ageBand: dto.ageBand,
      userType: UserType.STUDENT,
      approvalStatus: UserApprovalStatus.APPROVED,
    });
  }

  registerTeacher(dto: RegisterTeacherDto) {
    return this.register({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
      ageBand: undefined,
      userType: UserType.TEACHER,
      approvalStatus: UserApprovalStatus.PENDING,
    });
  }

  private async register(input: {
    email: string;
    password: string;
    displayName: string;
    ageBand: string | undefined;
    userType: UserType;
    approvalStatus: UserApprovalStatus;
  }) {
    const email = input.email.trim().toLowerCase();
    const existed = await this.prisma.user.findUnique({ where: { email } });

    if (existed) {
      throw new BadRequestException(
        existed.deletedAt
          ? '该邮箱账号已在回收站，请联系管理员恢复或永久删除后再注册'
          : 'Email already exists',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        username: null,
        passwordHash: await bcrypt.hash(input.password, 12),
        displayName: input.displayName.trim(),
        ageBand: input.ageBand?.trim(),
        userType: input.userType,
        approvalStatus: input.approvalStatus,
      },
    });

    if (user.userType === UserType.STUDENT) {
      await this.workItems.createStudentRegistration(user).catch(() => undefined);
    }

    if (user.userType === UserType.TEACHER) {
      await this.workItems.createTeacherPendingApproval(user).catch(() => undefined);
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      userType: user.userType,
      approvalStatus: user.approvalStatus,
      ageBand: user.ageBand,
    };
  }
}
