import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClassMemberRole,
  CourseAssignmentStatus,
  CourseRuntimeType,
  CourseStatus,
  CourseTeachingStatus,
  CoursewareTeachingStatus,
  LearningRecordStatus,
  Prisma,
  UserApprovalStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { Request, Response } from 'express';
import { spawn } from 'child_process';
import http from 'http';
import net from 'net';
import path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { WorkItemsService } from '../work-items/work-items.service';
import { CreateCourseLaunchDto } from './dto/create-course-launch.dto';
import { UpsertLaunchLearningRecordDto } from './dto/upsert-launch-learning-record.dto';
import { UpsertLearningRecordDto } from './dto/upsert-learning-record.dto';
import { UploadLaunchArtifactDto } from './dto/upload-launch-artifact.dto';

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
  runtimeType?: CourseRuntimeType;
  manifest?: Prisma.JsonValue | null;
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
    const assignment = await this.prisma.courseAssignment.findFirst({
      where: {
        id: dto.assignmentId,
        class: { deletedAt: null, organization: { deletedAt: null } },
      },
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
    await this.ensureAssignmentCoursewareOpen(assignment.id, courseware.id);
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
      launchUrl: this.appendLaunchToken(this.coursewareEntryUrl(courseware), launchToken),
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

  async uploadLaunchArtifact(dto: UploadLaunchArtifactDto) {
    const session = await this.findValidLaunchSession(dto.launchToken);
    const content = Buffer.from(dto.contentBase64, 'base64');
    const maxBytes = this.learningArtifactMaxBytes();

    if (!content.byteLength) {
      throw new BadRequestException('附件内容不能为空');
    }

    if (content.byteLength > maxBytes) {
      throw new BadRequestException(`附件大小不能超过 ${Math.round(maxBytes / 1024 / 1024)} MB`);
    }

    if (!this.isAllowedArtifactMime(dto.mimeType)) {
      throw new BadRequestException('暂不支持该附件类型');
    }

    const record = await this.upsertStudentRecord(session.studentId, {
      courseId: session.courseId,
      coursewareId: session.coursewareId,
      assignmentId: session.assignmentId ?? undefined,
      classId: session.classId ?? undefined,
      status: LearningRecordStatus.STARTED,
    });

    const artifactId = randomBytes(16).toString('hex');
    const originalFileName = this.safeOriginalFileName(dto.fileName);
    const extension = this.extensionFromFileName(originalFileName, dto.mimeType);
    const fileName = `${artifactId}${extension}`;
    const storageDir = path.join(
      this.learningArtifactRoot(),
      session.assignmentId ?? 'no-assignment',
      session.coursewareId,
      session.studentId,
    );
    await mkdir(storageDir, { recursive: true });
    const storagePath = path.join(storageDir, fileName);
    await writeFile(storagePath, content);

    const publicUrl = `${this.platformPublicUrl()}/api/v1/course-runtime/artifacts/${artifactId}/file`;
    const artifact = await this.prisma.learningRecordArtifact.create({
      data: {
        id: artifactId,
        learningRecordId: record.id,
        assignmentId: session.assignmentId,
        courseId: session.courseId,
        coursewareId: session.coursewareId,
        studentId: session.studentId,
        kind: this.normalizeArtifactKind(dto.kind),
        fileName,
        originalFileName,
        mimeType: dto.mimeType,
        sizeBytes: content.byteLength,
        storagePath,
        publicUrl,
        metadata: dto.metadata as Prisma.InputJsonValue,
      },
    });

    return this.toArtifact(artifact);
  }

  async sendArtifactFile(artifactId: string, response: Response) {
    const artifact = await this.prisma.learningRecordArtifact.findUnique({
      where: { id: artifactId },
    });

    if (!artifact) {
      response.status(404).json({ message: 'Artifact not found' });
      return;
    }

    try {
      await stat(artifact.storagePath);
    } catch {
      response.status(404).json({ message: 'Artifact file not found' });
      return;
    }

    response.setHeader('Content-Type', artifact.mimeType);
    response.setHeader('Content-Length', String(artifact.sizeBytes));
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(artifact.originalFileName)}"`,
    );

    createReadStream(artifact.storagePath).pipe(response);
  }

  async upsertRecord(studentId: string, dto: UpsertLearningRecordDto) {
    await this.ensureApprovedStudent(studentId);
    const record = await this.upsertStudentRecord(studentId, dto);

    if (dto.status === LearningRecordStatus.COMPLETED) {
      await this.workItems.createLearningRecordCompleted(record.id).catch(() => undefined);
    }

    return record;
  }

  async serveCoursewareRuntime(
    courseSlug: string,
    coursewareSlug: string,
    coursePath: string,
    request: Request,
    response: Response,
  ) {
    if (courseSlug === 'api') {
      response.status(404).json({ message: 'Courseware not found' });
      return;
    }

    const courseware = await this.findPublishedRuntimeCourseware(courseSlug, coursewareSlug);

    if (!courseware || !courseware.manifestValid) {
      this.sendCoursewareNotFound(response);
      return;
    }

    const normalizedPath = this.normalizeRuntimePath(coursePath);

    if (this.shouldProxyCoursewareRequest(courseware, normalizedPath)) {
      return this.proxyNodeRuntime(
        courseSlug,
        coursewareSlug,
        normalizedPath,
        request,
        response,
      );
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.status(405).json({ message: 'Method not allowed for static courseware' });
      return;
    }

    await this.sendStaticCoursewareFile(courseware, normalizedPath, request, response);
  }

  async proxyNodeRuntime(
    courseSlug: string,
    coursewareSlug: string,
    coursePath: string,
    request: Request,
    response: Response,
  ) {
    const courseware = await this.findPublishedRuntimeCourseware(courseSlug, coursewareSlug);

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
          const shouldInjectReturnButton = this.shouldInjectReturnButton(
            request,
            upstreamResponse.headers,
          );

          response.status(upstreamResponse.statusCode ?? 502);
          for (const [name, value] of Object.entries(upstreamResponse.headers)) {
            if (value !== undefined) {
              if (
                shouldInjectReturnButton &&
                ['content-length', 'transfer-encoding'].includes(name.toLowerCase())
              ) {
                continue;
              }
              response.setHeader(name, value);
            }
          }

          if (shouldInjectReturnButton) {
            const chunks: Buffer[] = [];
            upstreamResponse.on('data', (chunk: Buffer) => {
              chunks.push(Buffer.from(chunk));
            });
            upstreamResponse.on('end', () => {
              const html = Buffer.concat(chunks).toString('utf8');
              const injected = this.injectReturnButton(html, this.returnUrlFromRequest(request));
              response.setHeader('Content-Type', 'text/html; charset=utf-8');
              response.setHeader('Content-Length', String(Buffer.byteLength(injected)));
              response.send(injected);
              resolve();
            });
            upstreamResponse.on('error', () => {
              if (!response.headersSent) {
                this.sendRuntimeUnavailable(response);
              } else {
                response.end();
              }
              resolve();
            });
            return;
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

  private async sendStaticCoursewareFile(
    courseware: RuntimeCourseware,
    coursePath: string,
    request: Request,
    response: Response,
  ) {
    const staticBase = await this.resolveStaticCoursewareBase(courseware);
    if (!staticBase) {
      this.sendCoursewareNotFound(response);
      return;
    }

    const indexPath = path.join(staticBase, 'index.html');
    const requestedPath = coursePath || 'index.html';
    const targetPath = this.safeStaticFilePath(staticBase, requestedPath);

    if (!targetPath) {
      response.status(400).json({ message: 'Invalid courseware path' });
      return;
    }

    let filePath = targetPath;
    let fileStat = await stat(filePath).catch(() => null);

    if (fileStat?.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      fileStat = await stat(filePath).catch(() => null);
    }

    if (!fileStat?.isFile()) {
      const acceptsHtml = String(request.headers.accept ?? '').includes('text/html');
      const indexStat = await stat(indexPath).catch(() => null);
      if (!acceptsHtml || !indexStat?.isFile()) {
        this.sendCoursewareNotFound(response);
        return;
      }

      filePath = indexPath;
      fileStat = indexStat;
    }

    const contentType = this.mimeTypeForFile(filePath);
    const shouldInjectReturnButton = this.shouldInjectReturnButton(request, {
      'content-type': contentType,
    });
    response.status(200);
    response.setHeader('Content-Type', contentType);
    response.setHeader(
      'Content-Length',
      String(
        shouldInjectReturnButton
          ? Buffer.byteLength(
              this.injectReturnButton(
                await readFile(filePath, 'utf8'),
                this.returnUrlFromRequest(request),
              ),
            )
          : fileStat.size,
      ),
    );
    response.setHeader('Cache-Control', filePath === indexPath ? 'no-store' : 'public, max-age=300');

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    if (shouldInjectReturnButton) {
      const html = await readFile(filePath, 'utf8');
      response.send(this.injectReturnButton(html, this.returnUrlFromRequest(request)));
      return;
    }

    createReadStream(filePath).pipe(response);
  }

  private shouldInjectReturnButton(
    request: Request,
    headers: Record<string, string | string[] | number | undefined>,
  ) {
    if (request.method !== 'GET') {
      return false;
    }

    const contentType = String(headers['content-type'] ?? '').toLowerCase();
    const contentEncoding = String(headers['content-encoding'] ?? '').toLowerCase();

    return contentType.includes('text/html') && !contentEncoding;
  }

  private returnUrlFromRequest(request: Request) {
    const rawReturnUrl = request.query.returnUrl;
    const firstReturnUrl = Array.isArray(rawReturnUrl) ? rawReturnUrl[0] : rawReturnUrl;
    const returnUrl = typeof firstReturnUrl === 'string' ? firstReturnUrl : '';

    if (!returnUrl) {
      return this.studentPortalUrl();
    }

    try {
      const parsed = new URL(returnUrl);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : this.studentPortalUrl();
    } catch {
      return this.studentPortalUrl();
    }
  }

  private injectReturnButton(html: string, returnUrl: string) {
    if (html.includes('data-zhimei-return-button')) {
      return html;
    }

    const escapedReturnUrl = this.escapeHtmlAttribute(returnUrl);
    const snippet = `
<a
  data-zhimei-return-button="true"
  href="${escapedReturnUrl}"
  style="position:fixed;left:22px;top:22px;z-index:2147483647;display:inline-flex;align-items:center;gap:8px;padding:12px 16px;border:2px solid rgba(15,23,42,.12);border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 14px 34px rgba(15,23,42,.16);color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;font-size:16px;font-weight:800;line-height:1;text-decoration:none;backdrop-filter:blur(14px);"
>
  <span style="font-size:20px;line-height:1;">←</span>
  <span>返回学生后台</span>
</a>`;

    if (/<\/body>/i.test(html)) {
      return html.replace(/<\/body>/i, `${snippet}\n</body>`);
    }

    return `${html}${snippet}`;
  }

  private escapeHtmlAttribute(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private async resolveStaticCoursewareBase(courseware: RuntimeCourseware) {
    if (
      courseware.runtimeType !== CourseRuntimeType.STATIC &&
      courseware.runtimeType !== CourseRuntimeType.BOTH
    ) {
      return null;
    }

    const root = this.coursewareRuntimeRoot(courseware.course.slug, courseware.slug);
    const staticRoot = path.join(root, 'static');

    if (await this.pathExists(path.join(staticRoot, 'index.html'))) {
      return staticRoot;
    }

    if (
      courseware.runtimeType === CourseRuntimeType.STATIC &&
      (await this.pathExists(path.join(root, 'index.html')))
    ) {
      return root;
    }

    return null;
  }

  private safeStaticFilePath(staticBase: string, requestedPath: string) {
    const parts: string[] = [];
    for (const rawPart of requestedPath.split('/').filter(Boolean)) {
      let part: string;
      try {
        part = decodeURIComponent(rawPart);
      } catch {
        return null;
      }

      if (!part || part === '.' || part === '..' || part.includes('\0')) {
        return null;
      }
      parts.push(part);
    }

    const resolvedBase = path.resolve(staticBase);
    const resolvedTarget = path.resolve(resolvedBase, ...parts);
    if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)) {
      return null;
    }

    return resolvedTarget;
  }

  private normalizeRuntimePath(coursePath: string) {
    return coursePath
      .replace(/^\/+/, '')
      .split('/')
      .filter(Boolean)
      .join('/');
  }

  private shouldProxyCoursewareRequest(courseware: RuntimeCourseware, coursePath: string) {
    if (
      courseware.runtimeType !== CourseRuntimeType.NODE &&
      courseware.runtimeType !== CourseRuntimeType.BOTH
    ) {
      return false;
    }

    if (courseware.runtimeType === CourseRuntimeType.NODE) {
      return true;
    }

    return ['api', 'media', 'projector', 'work'].some(
      (prefix) => coursePath === prefix || coursePath.startsWith(`${prefix}/`),
    );
  }

  private sendCoursewareNotFound(response: Response) {
    const acceptsHtml = String(response.req.headers.accept ?? '').includes('text/html');
    if (acceptsHtml) {
      response.status(404).type('html').send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>课件不存在</title>
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
      <h1>课件不存在或尚未发布</h1>
      <p>请确认课程和课件已发布，并且 ZIP 已通过 manifest 校验。</p>
    </section>
  </body>
</html>`);
      return;
    }

    response.status(404).json({ message: 'Courseware not found' });
  }

  private mimeTypeForFile(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
    };

    return mimeTypes[ext] ?? 'application/octet-stream';
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
    const assignment = await this.prisma.courseAssignment.findFirst({
      where: {
        id: dto.assignmentId,
        class: { deletedAt: null, organization: { deletedAt: null } },
      },
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
    await this.ensureAssignmentCoursewareOpen(assignment.id, courseware.id);
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
    if (session.assignmentId) {
      await this.ensureAssignmentCoursewareOpen(session.assignmentId, session.coursewareId);
    }

    return session;
  }

  private async ensureAssignmentCoursewareOpen(assignmentId: string, coursewareId: string) {
    const state = await this.prisma.courseAssignmentCoursewareState.findUnique({
      where: {
        assignmentId_coursewareId: {
          assignmentId,
          coursewareId,
        },
      },
    });

    if (!state || state.status !== CoursewareTeachingStatus.OPEN) {
      throw new ForbiddenException('课件暂未开放');
    }
  }

  private async findPublishedRuntimeCourseware(courseSlug: string, coursewareSlug: string) {
    const link = await this.prisma.courseCourseware.findFirst({
      where: {
        course: {
          slug: courseSlug,
          status: CourseStatus.PUBLISHED,
          deletedAt: null,
        },
        courseware: {
          slug: coursewareSlug,
          status: CourseStatus.PUBLISHED,
          deletedAt: null,
          course: { deletedAt: null },
        },
      },
      include: { courseware: { include: { course: true } } },
    });

    if (link) {
      return link.courseware;
    }

    const ownCourseware = await this.prisma.courseware.findFirst({
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

    if (ownCourseware) {
      return ownCourseware;
    }

    return this.prisma.courseware.findFirst({
      where: {
        slug: coursewareSlug,
        status: CourseStatus.PUBLISHED,
        deletedAt: null,
        course: {
          slug: courseSlug,
          deletedAt: null,
        },
        courseLinks: {
          some: {
            course: {
              status: CourseStatus.PUBLISHED,
              deletedAt: null,
            },
          },
        },
      },
      include: { course: true },
    });
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
    const membership = await this.prisma.userClass.findFirst({
      where: {
        userId: studentId,
        classId,
        class: { deletedAt: null, organization: { deletedAt: null } },
      },
    });

    if (!membership || membership.role !== ClassMemberRole.STUDENT) {
      throw new ForbiddenException('Student is not in this class');
    }
  }

  private launchTokenTtlSeconds() {
    return Number(this.config.get<string>('COURSE_LAUNCH_TOKEN_TTL_SECONDS', '28800'));
  }

  private learningArtifactMaxBytes() {
    return Number(this.config.get<string>('LEARNING_ARTIFACT_MAX_BYTES', String(50 * 1024 * 1024)));
  }

  private learningArtifactRoot() {
    return path.resolve(
      this.config.get<string>('LEARNING_ARTIFACT_ROOT') || './learning-artifacts',
    );
  }

  private platformPublicUrl() {
    return this.config.get<string>('PLATFORM_PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, '');
  }

  private normalizeArtifactKind(kind: string) {
    const normalized = kind.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    return normalized || 'file';
  }

  private safeOriginalFileName(fileName: string) {
    const baseName = path.basename(fileName.trim()).replace(/[/\\]/g, '');
    return baseName || 'artifact';
  }

  private extensionFromFileName(fileName: string, mimeType: string) {
    const extension = path.extname(fileName).toLowerCase();
    if (extension && extension.length <= 12) {
      return extension;
    }

    const fallback: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'audio/wav': '.wav',
      'video/mp4': '.mp4',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'text/vtt': '.vtt',
      'application/json': '.json',
    };

    return fallback[mimeType.toLowerCase()] ?? '.bin';
  }

  private isAllowedArtifactMime(mimeType: string) {
    const normalized = mimeType.toLowerCase();
    return (
      normalized.startsWith('image/') ||
      normalized.startsWith('audio/') ||
      normalized.startsWith('video/') ||
      normalized === 'application/pdf' ||
      normalized === 'application/json' ||
      normalized === 'application/octet-stream' ||
      normalized === 'text/vtt' ||
      normalized === 'text/plain'
    );
  }

  private coursewareEntryUrl(courseware: RuntimeCourseware) {
    return this.buildCoursewareEntryUrl(
      courseware.course.slug,
      courseware.slug,
      this.manifestEntry(courseware.manifest ?? null),
    );
  }

  private buildCoursewareEntryUrl(courseSlug: string, coursewareSlug: string, entry: string) {
    const normalizedEntry = entry.startsWith('/') ? entry : `/${entry}`;
    return `${this.agentPublicUrl()}/${courseSlug}/${coursewareSlug}${normalizedEntry === '/' ? '/' : normalizedEntry}`;
  }

  private manifestEntry(rawManifest: Prisma.JsonValue | null) {
    if (rawManifest && typeof rawManifest === 'object' && !Array.isArray(rawManifest)) {
      const raw = rawManifest as Record<string, unknown>;
      if (typeof raw.entry === 'string' && raw.entry.trim().startsWith('/')) {
        return raw.entry.trim();
      }
    }

    return '/';
  }

  private agentPublicUrl() {
    return this.config.get<string>('AGENT_PUBLIC_URL', 'http://agent.docpine.online').replace(/\/$/, '');
  }

  private coursewareRuntimeRoot(courseSlug: string, coursewareSlug: string) {
    return path.join(this.courseRuntimeRoot(courseSlug), 'coursewares', coursewareSlug);
  }

  private courseRuntimeRoot(courseSlug: string) {
    const configuredRoot = this.config.get<string>('COURSE_RUNTIME_ROOT');
    const runtimeRoot = configuredRoot?.trim() || path.join(process.cwd(), 'course-runtime');
    return path.resolve(runtimeRoot, courseSlug);
  }

  private async pathExists(filePath: string) {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private hashLaunchToken(launchToken: string) {
    return createHash('sha256').update(launchToken).digest('hex');
  }

  private appendLaunchToken(entryUrl: string, launchToken: string) {
    const platformApiBase = `${this.config
      .get<string>('PLATFORM_PUBLIC_URL', 'http://localhost:3000')
      .replace(/\/$/, '')}/api/v1`;
    const returnUrl = this.studentPortalUrl();

    try {
      const url = new URL(entryUrl);
      url.searchParams.set('launchToken', launchToken);
      url.searchParams.set('platformApiBase', platformApiBase);
      url.searchParams.set('returnUrl', returnUrl);
      return url.toString();
    } catch {
      const params = new URLSearchParams({
        launchToken,
        platformApiBase,
        returnUrl,
      });
      const separator = entryUrl.includes('?') ? '&' : '?';
      return `${entryUrl}${separator}${params.toString()}`;
    }
  }

  private studentPortalUrl() {
    const configuredUrl =
      this.config.get<string>('STUDENT_PORTAL_PUBLIC_URL') ||
      this.config.get<string>('STUDENT_PUBLIC_URL');

    return (configuredUrl || this.defaultStudentPortalUrl()).replace(/\/$/, '');
  }

  private defaultStudentPortalUrl(): string {
    const publicUrl = this.config.get<string>('PLATFORM_PUBLIC_URL', 'http://localhost:3000');

    try {
      const url = new URL(publicUrl);

      if (url.hostname.endsWith('docpine.online')) {
        return `${url.protocol}//student.docpine.online`;
      }

      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return 'http://localhost:5173/?portal=student';
      }

      return `${url.protocol}//${url.host}`;
    } catch {
      return 'http://student.docpine.online';
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
      artifacts: {
        orderBy: { createdAt: 'asc' },
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
    artifacts?: Array<{
      id: string;
      kind: string;
      fileName: string;
      originalFileName: string;
      mimeType: string;
      sizeBytes: number;
      publicUrl: string;
      metadata: unknown;
      createdAt: Date;
    }>;
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
      artifacts: (record.artifacts ?? []).map((artifact) => this.toArtifact(artifact)),
    };
  }

  private toArtifact(artifact: {
    id: string;
    kind: string;
    fileName: string;
    originalFileName: string;
    mimeType: string;
    sizeBytes: number;
    publicUrl: string;
    metadata: unknown;
    createdAt: Date;
  }) {
    return {
      id: artifact.id,
      kind: artifact.kind,
      fileName: artifact.fileName,
      originalFileName: artifact.originalFileName,
      mimeType: artifact.mimeType,
      sizeBytes: artifact.sizeBytes,
      url: artifact.publicUrl,
      metadata: artifact.metadata,
      createdAt: artifact.createdAt,
    };
  }
}
