import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClassMemberRole,
  CourseAssignmentStatus,
  CourseRuntimeType,
  CourseStatus,
  CourseTeachingStatus,
  LearningRecordStatus,
  Prisma,
  UserApprovalStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { spawn } from 'child_process';
import http from 'http';
import net from 'net';
import { PrismaService } from '../prisma/prisma.service';
import { WorkItemsService } from '../work-items/work-items.service';
import { CreateCourseLaunchDto } from './dto/create-course-launch.dto';
import { UpsertLaunchLearningRecordDto } from './dto/upsert-launch-learning-record.dto';
import { UpsertLearningRecordDto } from './dto/upsert-learning-record.dto';

type CourseLookup = {
  courseId?: string;
  courseSlug?: string;
  coursewareId?: string;
  coursewareSlug?: string;
};

type LearningRecordInput = CourseLookup & {
  assignmentId?: string;
  classId?: string;
  status: LearningRecordStatus;
  score?: number;
  durationSeconds?: number;
  summary?: Record<string, unknown>;
};

type RuntimeCourseware = {
  id: string;
  slug: string;
  nodePort: number | null;
  course: { slug: string };
};

@Injectable()
export class CourseRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly workItems: WorkItemsService,
  ) {}

  async createLaunch(studentId: string, dto: CreateCourseLaunchDto) {
    await this.ensureApprovedStudent(studentId);

    if (!dto.assignmentId) {
      throw new BadRequestException('assignmentId is required to launch courseware');
    }

    const courseware = await this.findPublishedCourseware(dto);
    const course = courseware.course;
    const assignment = await this.prisma.courseAssignment.findUnique({
      where: { id: dto.assignmentId },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (assignment.courseId !== course.id) {
      throw new BadRequestException('Assignment does not belong to course');
    }
    if (assignment.status !== CourseAssignmentStatus.ACTIVE) {
      throw new ForbiddenException('Assignment is not active');
    }
    if (assignment.teachingStatus !== CourseTeachingStatus.OPEN) {
      throw new ForbiddenException('Course is not open');
    }
    if (dto.classId && dto.classId !== assignment.classId) {
      throw new BadRequestException('Class does not belong to assignment');
    }
    await this.ensureStudentInClass(studentId, assignment.classId);

    const launchToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.launchTokenTtlSeconds() * 1000);
    const session = await this.prisma.courseLaunchSession.create({
      data: {
        tokenHash: this.hashLaunchToken(launchToken),
        courseId: course.id,
        coursewareId: courseware.id,
        assignmentId: assignment.id,
        classId: assignment.classId,
        studentId,
        expiresAt,
      },
      include: this.launchSessionInclude(),
    });

    const record = await this.upsertStudentRecord(studentId, {
      courseId: course.id,
      coursewareId: courseware.id,
      assignmentId: assignment.id,
      classId: assignment.classId,
      status: LearningRecordStatus.STARTED,
      summary: { source: 'course-launch', launchSessionId: session.id },
    });

    return {
      launchToken,
      launchUrl: this.appendLaunchToken(courseware.entryUrl, launchToken),
      expiresAt,
      context: this.toLaunchContext(session),
      record,
    };
  }

  async verifyLaunch(launchToken: string) {
    const session = await this.findValidLaunchSession(launchToken);
    const updated = await this.prisma.courseLaunchSession.update({
      where: { id: session.id },
      data: { lastVerifiedAt: new Date() },
      include: this.launchSessionInclude(),
    });

    return {
      context: this.toLaunchContext(updated),
      reportEndpoint: '/api/v1/course-runtime/launch/records',
    };
  }

  async upsertLaunchRecord(dto: UpsertLaunchLearningRecordDto) {
    const session = await this.findValidLaunchSession(dto.launchToken);

    const record = await this.upsertStudentRecord(session.studentId, {
      courseId: session.courseId,
      coursewareId: session.coursewareId,
      assignmentId: session.assignmentId ?? undefined,
      classId: session.classId ?? undefined,
      status: dto.status,
      score: dto.score,
      durationSeconds: dto.durationSeconds,
      summary: dto.summary,
    });

    if (dto.status === LearningRecordStatus.COMPLETED) {
      await this.workItems.createLearningRecordCompleted(record.id).catch(() => undefined);
    }

    return record;
  }

  async upsertRecord(studentId: string, dto: UpsertLearningRecordDto) {
    await this.ensureApprovedStudent(studentId);
    const record = await this.upsertStudentRecord(studentId, dto);

    if (dto.status === LearningRecordStatus.COMPLETED) {
      await this.workItems.createLearningRecordCompleted(record.id).catch(() => undefined);
    }

    return record;
  }

  async proxyNodeRuntime(
    courseSlug: string,
    coursewareSlug: string,
    coursePath: string,
    request: Request,
    response: Response,
  ) {
    const courseware = await this.prisma.courseware.findFirst({
      where: {
        slug: coursewareSlug,
        status: CourseStatus.PUBLISHED,
        deletedAt: null,
        course: {
          slug: courseSlug,
          status: CourseStatus.PUBLISHED,
          deletedAt: null,
        },
      },
      include: { course: true },
    });

    if (
      !courseware ||
      !courseware.manifestValid ||
      !courseware.nodePort ||
      (courseware.runtimeType !== CourseRuntimeType.NODE &&
        courseware.runtimeType !== CourseRuntimeType.BOTH)
    ) {
      response.status(404).json({ message: 'Published Node courseware not found' });
      return;
    }

    const reachable = await this.ensureRuntimeReachable(courseware);
    if (!reachable) {
      await this.prisma.courseware.update({
        where: { id: courseware.id },
        data: {
          deploymentStatus: 'STOPPED',
          deploymentMessage: '课件服务暂时不可用，系统自动重启未恢复',
        },
      }).catch(() => undefined);
      await this.workItems
        .createCoursewareDeploymentFailed(
          courseware.id,
          '课件服务暂时不可用，系统自动重启未恢复',
        )
        .catch(() => undefined);
      this.sendRuntimeUnavailable(response);
      return;
    }

    const normalizedPath = coursePath
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(decodeURIComponent(part)))
      .join('/');
    const queryIndex = request.originalUrl.indexOf('?');
    const query = queryIndex >= 0 ? request.originalUrl.slice(queryIndex) : '';
    const targetPath =
      `/${courseware.course.slug}/${courseware.slug}${normalizedPath ? `/${normalizedPath}` : ''}${query}`;
    const body = this.proxyRequestBody(request);

    await new Promise<void>((resolve) => {
      const headers = { ...request.headers };
      delete headers.host;
      delete headers['content-length'];

      if (body) {
        headers['content-length'] = String(body.byteLength);
      }

      const upstream = http.request(
        {
          host: '127.0.0.1',
          port: courseware.nodePort,
          method: request.method,
          path: targetPath,
          headers: {
            ...headers,
            'x-forwarded-host': request.headers.host ?? '',
            'x-forwarded-proto': request.protocol,
          },
        },
        (upstreamResponse) => {
          response.status(upstreamResponse.statusCode ?? 502);
          for (const [name, value] of Object.entries(upstreamResponse.headers)) {
            if (value !== undefined) {
              response.setHeader(name, value);
            }
          }
          upstreamResponse.pipe(response);
          upstreamResponse.on('end', () => resolve());
        },
      );

      upstream.on('error', () => {
        if (!response.headersSent) {
          this.sendRuntimeUnavailable(response);
        } else {
          response.end();
        }
        resolve();
      });

      if (body) {
        upstream.write(body);
      }
      upstream.end();
    });
  }

  private async ensureRuntimeReachable(courseware: RuntimeCourseware) {
    if (!courseware.nodePort) {
      return false;
    }

    if (await this.isPortReachable(courseware.nodePort, 1200)) {
      return true;
    }

    const restarted = await this.restartSystemdRuntime(courseware);
    if (!restarted) {
      return false;
    }

    return this.waitForRuntimePort(courseware.nodePort, 15000);
  }

  private async restartSystemdRuntime(courseware: RuntimeCourseware) {
    if (!this.shouldUseSystemdRuntime()) {
      return false;
    }

    const serviceName = this.systemdServiceName(courseware);
    const helper = this.systemdHelperPath();
    const command = helper || 'systemctl';
    const args = helper ? ['restart', serviceName] : ['restart', serviceName];
    const result = await this.runSystemCommand(command, args, {
      elevated: true,
      ignoreFailure: true,
    });
    return result.ok;
  }

  private async waitForRuntimePort(port: number, timeoutMs: number) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (await this.isPortReachable(port, 1000)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return false;
  }

  private async isPortReachable(port: number, timeoutMs: number) {
    return new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      const done = (reachable: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(reachable);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
    });
  }

  private sendRuntimeUnavailable(response: Response) {
    const message = '课件服务暂时不可用，系统已尝试自动重启但未恢复，请联系管理员在后台重启课件。';
    const acceptsHtml = String(response.req.headers.accept ?? '').includes('text/html');

    if (acceptsHtml) {
      response.status(503).type('html').send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>课件暂时不可用</title>
    <style>
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: #f6f7fb;
        color: #172033;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      section {
        width: min(520px, calc(100vw - 32px));
        padding: 32px;
        border: 1px solid #d9deea;
        border-radius: 10px;
        background: #fff;
        box-shadow: 0 18px 48px rgba(23, 32, 51, 0.08);
      }
      h1 { margin: 0; font-size: 26px; }
      p { margin: 12px 0 0; color: #5b6680; line-height: 1.7; }
    </style>
  </head>
  <body>
    <section>
      <h1>课件暂时不可用</h1>
      <p>${message}</p>
    </section>
  </body>
</html>`);
      return;
    }

    response.status(503).json({
      message,
      code: 'COURSE_RUNTIME_UNAVAILABLE',
    });
  }

  private shouldUseSystemdRuntime() {
    const configured = this.config.get<string>('COURSE_RUNTIME_SYSTEMD');
    if (configured !== undefined) {
      return ['1', 'true', 'yes', 'on'].includes(configured.trim().toLowerCase());
    }

    return process.platform === 'linux';
  }

  private shouldUseSudoForSystemd() {
    const configured = this.config.get<string>('COURSE_RUNTIME_SUDO');
    if (configured !== undefined) {
      return ['1', 'true', 'yes', 'on'].includes(configured.trim().toLowerCase());
    }

    return typeof process.getuid === 'function' && process.getuid() !== 0;
  }

  private systemdServiceName(courseware: RuntimeCourseware) {
    return [
      'meiyu-courseware',
      this.sanitizeSystemdNamePart(courseware.course.slug),
      this.sanitizeSystemdNamePart(courseware.slug),
      courseware.id.slice(0, 8),
    ].join('-').slice(0, 190).replace(/-+$/g, '').concat('.service');
  }

  private systemdHelperPath() {
    return this.config.get<string>('COURSE_RUNTIME_SYSTEMD_HELPER')?.trim() || '';
  }

  private sanitizeSystemdNamePart(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'runtime';
  }

  private async runSystemCommand(
    command: string,
    args: string[],
    options: { elevated?: boolean; ignoreFailure?: boolean } = {},
  ) {
    const actualCommand = options.elevated && this.shouldUseSudoForSystemd()
      ? 'sudo'
      : command;
    const actualArgs = options.elevated && this.shouldUseSudoForSystemd()
      ? [command, ...args]
      : args;

    return new Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const child = spawn(actualCommand, actualArgs, { shell: false });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        if (options.ignoreFailure) {
          resolve({ ok: false, stdout, stderr: error.message, code: null });
          return;
        }
        reject(error);
      });

      child.on('close', (code) => {
        const ok = code === 0;
        if (!ok && !options.ignoreFailure) {
          reject(new Error(`${actualCommand} ${actualArgs.join(' ')} failed with exit code ${code}: ${stderr || stdout}`));
          return;
        }
        resolve({ ok, stdout, stderr, code });
      });
    });
  }

  private async upsertStudentRecord(studentId: string, dto: LearningRecordInput) {
    if (!dto.assignmentId) {
      throw new BadRequestException('assignmentId is required to report learning records');
    }

    const courseware = await this.findPublishedCourseware(dto);
    const course = courseware.course;
    const assignment = await this.prisma.courseAssignment.findUnique({
      where: { id: dto.assignmentId },
      include: { course: true },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (assignment.courseId !== course.id) {
      throw new BadRequestException('Assignment does not belong to course');
    }
    if (assignment.status !== CourseAssignmentStatus.ACTIVE) {
      throw new ForbiddenException('Assignment is not active');
    }
    if (assignment.teachingStatus !== CourseTeachingStatus.OPEN) {
      throw new ForbiddenException('Course is not open');
    }
    if (dto.classId && dto.classId !== assignment.classId) {
      throw new BadRequestException('Class does not belong to assignment');
    }
    await this.ensureStudentInClass(studentId, assignment.classId);

    const existing = await this.prisma.learningRecord.findFirst({
      where: {
        studentId,
        courseId: course.id,
        coursewareId: courseware.id,
        assignmentId: assignment.id,
        classId: assignment.classId,
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    if (existing?.status === LearningRecordStatus.COMPLETED && dto.status === LearningRecordStatus.STARTED) {
      const record = await this.prisma.learningRecord.findUniqueOrThrow({
        where: { id: existing.id },
        include: this.includeRelations(),
      });
      return this.toRecord(record);
    }

    const data: Prisma.LearningRecordUncheckedCreateInput = {
      courseId: course.id,
      coursewareId: courseware.id,
      assignmentId: assignment.id,
      classId: assignment.classId,
      studentId,
      status: dto.status,
      score: dto.score,
      durationSeconds: dto.durationSeconds,
      summary: dto.summary as Prisma.InputJsonValue,
      startedAt: dto.status === LearningRecordStatus.STARTED ? now : undefined,
      completedAt: dto.status === LearningRecordStatus.COMPLETED ? now : undefined,
    };

    if (!existing) {
      const record = await this.prisma.learningRecord.create({
        data,
        include: this.includeRelations(),
      });
      return this.toRecord(record);
    }

    const record = await this.prisma.learningRecord.update({
      where: { id: existing.id },
      data: {
        status: dto.status,
        ...(dto.score !== undefined ? { score: dto.score } : {}),
        ...(dto.durationSeconds !== undefined ? { durationSeconds: dto.durationSeconds } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary as Prisma.InputJsonValue } : {}),
        ...(dto.status === LearningRecordStatus.STARTED && !existing.startedAt
          ? { startedAt: now }
          : {}),
        ...(dto.status === LearningRecordStatus.COMPLETED ? { completedAt: now } : {}),
      },
      include: this.includeRelations(),
    });

    return this.toRecord(record);
  }

  private proxyRequestBody(request: Request) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      return null;
    }

    if (Buffer.isBuffer(request.body)) {
      return request.body;
    }

    if (typeof request.body === 'string') {
      return Buffer.from(request.body);
    }

    if (request.body && Object.keys(request.body).length > 0) {
      return Buffer.from(JSON.stringify(request.body));
    }

    return null;
  }

  private async findValidLaunchSession(launchToken: string) {
    const session = await this.prisma.courseLaunchSession.findUnique({
      where: { tokenHash: this.hashLaunchToken(launchToken) },
      include: this.launchSessionInclude(),
    });

    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('Launch token is invalid or expired');
    }

    if (session.course.deletedAt || session.course.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException('Published course not found');
    }

    if (session.courseware.deletedAt || session.courseware.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException('Published courseware not found');
    }

    if (
      session.student.deletedAt ||
      session.student.status !== UserStatus.ACTIVE ||
      session.student.approvalStatus !== UserApprovalStatus.APPROVED ||
      session.student.userType !== UserType.STUDENT
    ) {
      throw new ForbiddenException('Student is not allowed to access this course');
    }

    if (session.assignment && session.assignment.status !== CourseAssignmentStatus.ACTIVE) {
      throw new ForbiddenException('Assignment is not active');
    }
    if (session.assignment && session.assignment.teachingStatus !== CourseTeachingStatus.OPEN) {
      throw new ForbiddenException('Course is not open');
    }

    return session;
  }

  private async findPublishedCourseware(dto: CourseLookup) {
    if (!dto.courseId && !dto.courseSlug && !dto.coursewareId) {
      throw new BadRequestException(
        'coursewareId, or courseId/courseSlug with coursewareSlug, is required',
      );
    }

    const selectedCourse = dto.courseId
      ? await this.prisma.course.findFirst({ where: { id: dto.courseId, deletedAt: null } })
      : dto.courseSlug
        ? await this.prisma.course.findFirst({
            where: { slug: dto.courseSlug, deletedAt: null },
          })
        : null;

    if (selectedCourse && selectedCourse.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException('Published course not found');
    }

    if (selectedCourse) {
      const link = await this.prisma.courseCourseware.findFirst({
        where: {
          courseId: selectedCourse.id,
          courseware: {
            status: CourseStatus.PUBLISHED,
            deletedAt: null,
            course: { deletedAt: null },
            ...(dto.coursewareId ? { id: dto.coursewareId } : {}),
            ...(dto.coursewareSlug ? { slug: dto.coursewareSlug } : {}),
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { courseware: { include: { course: true } } },
      });

      if (!link) {
        throw new NotFoundException('Published courseware not found');
      }

      return {
        ...link.courseware,
        sortOrder: link.sortOrder,
        course: selectedCourse,
      };
    }

    const courseware = await this.prisma.courseware.findFirst({
      where: {
        id: dto.coursewareId,
        status: CourseStatus.PUBLISHED,
        deletedAt: null,
        course: {
          status: CourseStatus.PUBLISHED,
          deletedAt: null,
        },
      },
      include: { course: true },
    });

    if (!courseware) {
      throw new NotFoundException('Published courseware not found');
    }

    return courseware;
  }

  private async ensureApprovedStudent(studentId: string) {
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, deletedAt: null },
    });
    if (
      !student ||
      student.status !== UserStatus.ACTIVE ||
      student.approvalStatus !== UserApprovalStatus.APPROVED ||
      student.userType !== UserType.STUDENT
    ) {
      throw new ForbiddenException('Only approved students can access course runtime');
    }

    return student;
  }

  private async ensureStudentInClass(studentId: string, classId: string) {
    const membership = await this.prisma.userClass.findUnique({
      where: {
        userId_classId: {
          userId: studentId,
          classId,
        },
      },
    });

    if (!membership || membership.role !== ClassMemberRole.STUDENT) {
      throw new ForbiddenException('Student is not in this class');
    }
  }

  private launchTokenTtlSeconds() {
    return Number(this.config.get<string>('COURSE_LAUNCH_TOKEN_TTL_SECONDS', '28800'));
  }

  private hashLaunchToken(launchToken: string) {
    return createHash('sha256').update(launchToken).digest('hex');
  }

  private appendLaunchToken(entryUrl: string, launchToken: string) {
    const platformApiBase = `${this.config
      .get<string>('PLATFORM_PUBLIC_URL', 'http://localhost:3000')
      .replace(/\/$/, '')}/api/v1`;

    try {
      const url = new URL(entryUrl);
      url.searchParams.set('launchToken', launchToken);
      url.searchParams.set('platformApiBase', platformApiBase);
      return url.toString();
    } catch {
      const params = new URLSearchParams({
        launchToken,
        platformApiBase,
      });
      const separator = entryUrl.includes('?') ? '&' : '?';
      return `${entryUrl}${separator}${params.toString()}`;
    }
  }

  private launchSessionInclude() {
    return {
      course: true,
      courseware: true,
      assignment: true,
      class: {
        include: {
          organization: true,
        },
      },
      student: {
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
          deletedAt: true,
        },
      },
    } as const;
  }

  private includeRelations() {
    return {
      course: true,
      courseware: true,
      assignment: true,
      class: {
        include: {
          organization: true,
        },
      },
      student: {
        select: {
          id: true,
          email: true,
          displayName: true,
          ageBand: true,
        },
      },
    } as const;
  }

  private toLaunchContext(session: {
    id: string;
    expiresAt: Date;
    course: {
      id: string;
      slug: string;
      title: string;
      description: string | null;
      runtimeType: CourseRuntimeType;
      entryUrl: string;
    };
    courseware: {
      id: string;
      slug: string;
      title: string;
      description: string | null;
      runtimeType: CourseRuntimeType;
      entryUrl: string;
      sortOrder: number;
    };
    assignment: {
      id: string;
      title: string;
      instructions: string | null;
      startAt: Date | null;
      dueAt: Date | null;
      teachingStatus: CourseTeachingStatus;
      openedAt: Date | null;
      closedAt: Date | null;
    } | null;
    class: {
      id: string;
      name: string;
      code: string | null;
      organization: {
        id: string;
        name: string;
        code: string | null;
      };
    } | null;
    student: {
      id: string;
      email: string;
      username: string | null;
      displayName: string | null;
      userType: UserType;
      approvalStatus: UserApprovalStatus;
      ageBand: string | null;
      status: UserStatus;
      isPlatformAdmin: boolean;
      deletedAt: Date | null;
    };
  }) {
    return {
      launchSessionId: session.id,
      expiresAt: session.expiresAt,
      student: session.student,
      course: session.course,
      courseware: session.courseware,
      assignment: session.assignment,
      class: session.class,
    };
  }

  private toRecord(record: {
    id: string;
    status: LearningRecordStatus;
    score: number | null;
    durationSeconds: number | null;
    summary: unknown;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    course: {
      id: string;
      slug: string;
      title: string;
      entryUrl: string;
    };
    courseware: {
      id: string;
      slug: string;
      title: string;
      entryUrl: string;
      sortOrder: number;
    };
    assignment: {
      id: string;
      title: string;
    } | null;
    class: {
      id: string;
      name: string;
      organization: {
        id: string;
        name: string;
      };
    } | null;
    student: {
      id: string;
      email: string;
      displayName: string | null;
      ageBand: string | null;
    };
  }) {
    return {
      id: record.id,
      status: record.status,
      score: record.score,
      durationSeconds: record.durationSeconds,
      summary: record.summary,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      course: record.course,
      courseware: record.courseware,
      assignment: record.assignment,
      class: record.class,
      student: record.student,
    };
  }
}
