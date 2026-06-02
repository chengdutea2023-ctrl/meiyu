import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Course,
  CourseOwnerType,
  CourseRuntimeType,
  CourseStatus,
  Prisma,
} from '@prisma/client';
import AdmZip from 'adm-zip';
import { spawn } from 'child_process';
import { closeSync, openSync, readFileSync } from 'fs';
import { access, appendFile, mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { DeployCourseRuntimeDto } from './dto/deploy-course-runtime.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UploadCourseFilesDto } from './dto/upload-course-files.dto';
import { UploadCourseZipDto } from './dto/upload-course-zip.dto';

type CourseDeploymentStatus =
  | 'NOT_UPLOADED'
  | 'UPLOADED'
  | 'READY'
  | 'STATIC_PUBLISHED'
  | 'DEPLOYING'
  | 'RUNNING'
  | 'FAILED'
  | 'STOPPED';

type CourseManifest = {
  slug: string;
  title: string;
  runtimeType: CourseRuntimeType;
  entry: string;
  nodePort: number | null;
};

type WrittenCourseFile = {
  path: string;
  bytes: number;
};

type ManifestValidation = {
  manifest: CourseManifest;
  valid: boolean;
  errors: string[];
  generated: boolean;
  entryUrl: string;
};

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateCourseDto, createdByUserId: string) {
    const slug = this.normalizeSlug(dto.slug);
    await this.ensureSlugAvailable(slug);

    return this.prisma.course.create({
      data: {
        slug,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        runtimeType: dto.runtimeType ?? CourseRuntimeType.STATIC,
        entryUrl: dto.entryUrl.trim(),
        ownerType: dto.ownerType ?? CourseOwnerType.ADMIN,
        createdByUserId,
      },
      include: this.includeRelations(),
    });
  }

  findMany() {
    return this.prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
      include: this.includeRelations(),
      take: 200,
    });
  }

  async findById(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: this.includeRelations(),
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  }

  async update(id: string, dto: UpdateCourseDto) {
    await this.ensureCourse(id);

    if (dto.slug) {
      const slug = this.normalizeSlug(dto.slug);
      const existed = await this.prisma.course.findUnique({ where: { slug } });
      if (existed && existed.id !== id) {
        throw new BadRequestException('Course slug already exists');
      }
    }

    return this.prisma.course.update({
      where: { id },
      data: {
        ...(dto.slug ? { slug: this.normalizeSlug(dto.slug) } : {}),
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.runtimeType ? { runtimeType: dto.runtimeType } : {}),
        ...(dto.entryUrl ? { entryUrl: dto.entryUrl.trim() } : {}),
        ...(dto.ownerType ? { ownerType: dto.ownerType } : {}),
      },
      include: this.includeRelations(),
    });
  }

  async updateStatus(id: string, status: CourseStatus) {
    await this.ensureCourse(id);

    return this.prisma.course.update({
      where: { id },
      data: { status },
      include: this.includeRelations(),
    });
  }

  async getManifest(id: string) {
    const course = await this.ensureCourse(id);
    const courseRoot = this.courseRoot(course.slug);
    const fileManifest = await this.readManifestFromDisk(courseRoot).catch(() => null);

    return {
      course,
      courseRoot,
      manifest: course.manifest ?? fileManifest,
      manifestValid: course.manifestValid,
      manifestErrors: course.manifestErrors,
      deploymentStatus: course.deploymentStatus,
      deploymentMessage: course.deploymentMessage,
      nodePort: course.nodePort,
      uploadedAt: course.uploadedAt,
      deployedAt: course.deployedAt,
    };
  }

  async getRuntimeStatus(id: string) {
    const course = await this.ensureCourse(id);
    let pid = await this.readRuntimePid(course.slug);
    let running = pid ? this.isPidRunning(pid) : false;
    let deploymentStatus = course.deploymentStatus as CourseDeploymentStatus;

    if (!running && course.nodePort) {
      const portPids = await this.findPidsByPort(course.nodePort);
      pid = portPids[0] ?? pid;
      running = portPids.length > 0;

      if (running && pid) {
        await writeFile(this.runtimePidPath(course.slug), `${pid}\n`);
      }
    }

    if (
      (course.runtimeType === CourseRuntimeType.NODE ||
        course.runtimeType === CourseRuntimeType.BOTH) &&
      deploymentStatus === 'RUNNING' &&
      !running
    ) {
      deploymentStatus = 'STOPPED';
      await this.prisma.course.update({
        where: { id: course.id },
        data: {
          deploymentStatus,
          deploymentMessage: 'Node 课件进程未运行',
        },
      });
    }

    return {
      course: await this.findById(id),
      courseRoot: this.courseRoot(course.slug),
      manifest: course.manifest,
      manifestValid: course.manifestValid,
      manifestErrors: course.manifestErrors,
      deploymentStatus,
      deploymentMessage: course.deploymentMessage,
      nodePort: course.nodePort,
      pid,
      running,
      logTail: await this.readRuntimeLogTail(course.slug),
    };
  }

  async uploadFiles(id: string, dto: UploadCourseFilesDto) {
    const course = await this.ensureCourse(id);
    if (dto.files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }

    const courseRoot = this.courseRoot(course.slug);
    await mkdir(courseRoot, { recursive: true });

    let totalBytes = 0;
    let manifestGenerated = false;
    let hasManifest = false;
    const writtenFiles: WrittenCourseFile[] = [];

    for (const file of dto.files) {
      const relativePath = this.sanitizeUploadPath(file.path, course.slug);
      const content = this.decodeBase64(file.contentBase64);
      totalBytes += content.byteLength;

      if (totalBytes > this.maxUploadBytes()) {
        throw new BadRequestException('Course upload exceeds size limit');
      }

      const target = path.join(courseRoot, relativePath);
      this.ensureInsideCourseRoot(courseRoot, target);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
      writtenFiles.push({ path: relativePath, bytes: content.byteLength });
      hasManifest ||= relativePath === 'manifest.json';
    }

    if (!hasManifest) {
      const manifest = this.defaultManifest(course);
      const manifestPath = path.join(courseRoot, 'manifest.json');
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      manifestGenerated = true;
      writtenFiles.push({
        path: 'manifest.json',
        bytes: Buffer.byteLength(JSON.stringify(manifest)),
      });
    }

    return this.finalizeCourseUpload(course, writtenFiles, {
      publish: dto.publish,
      manifestGenerated,
    });
  }

  async uploadZip(id: string, dto: UploadCourseZipDto) {
    const course = await this.ensureCourse(id);
    const zipBuffer = this.decodeBase64(dto.contentBase64);

    if (zipBuffer.byteLength > this.maxUploadBytes()) {
      throw new BadRequestException('Course upload exceeds size limit');
    }

    if (!dto.fileName.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('Only .zip files are allowed');
    }

    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    const rootPrefix = this.findZipRootPrefix(entries.map((entry) => entry.entryName));
    const courseRoot = this.courseRoot(course.slug);
    const writtenFiles: WrittenCourseFile[] = [];
    let totalBytes = 0;
    let hasManifest = false;

    await rm(courseRoot, { recursive: true, force: true });
    await mkdir(courseRoot, { recursive: true });

    for (const entry of entries) {
      let entryName = entry.entryName.replace(/\\/g, '/').replace(/^\/+/, '');
      if (this.shouldIgnoreZipEntry(entryName)) {
        continue;
      }

      if (rootPrefix && entryName.startsWith(`${rootPrefix}/`)) {
        entryName = entryName.slice(rootPrefix.length + 1);
      }

      if (!entryName || entry.isDirectory) {
        continue;
      }

      const relativePath = this.sanitizeUploadPath(entryName, course.slug);
      const content = entry.getData();
      totalBytes += content.byteLength;

      if (totalBytes > this.maxUploadBytes()) {
        throw new BadRequestException('Course upload exceeds size limit');
      }

      const target = path.join(courseRoot, relativePath);
      this.ensureInsideCourseRoot(courseRoot, target);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
      writtenFiles.push({ path: relativePath, bytes: content.byteLength });
      hasManifest ||= relativePath === 'manifest.json';
    }

    if (writtenFiles.length === 0) {
      throw new BadRequestException('ZIP does not contain course files');
    }

    let manifestGenerated = false;
    if (!hasManifest) {
      const manifest = this.defaultManifest(course);
      const manifestPath = path.join(courseRoot, 'manifest.json');
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      manifestGenerated = true;
      writtenFiles.push({
        path: 'manifest.json',
        bytes: Buffer.byteLength(JSON.stringify(manifest)),
      });
    }

    return this.finalizeCourseUpload(course, writtenFiles, {
      publish: dto.publish,
      manifestGenerated,
    });
  }

  async deployRuntime(id: string, dto: DeployCourseRuntimeDto) {
    const course = await this.ensureCourse(id);
    const runtimeType = course.runtimeType;
    if (runtimeType === CourseRuntimeType.STATIC) {
      throw new BadRequestException('静态课件不需要 Node 部署');
    }

    if (!course.manifestValid) {
      throw new BadRequestException('manifest 校验未通过，不能部署');
    }

    const courseRoot = this.courseRoot(course.slug);
    const serverDir = await this.findNodeServerDir(courseRoot);
    if (!serverDir) {
      throw new BadRequestException('Node 课件需要 server/package.json 或根目录 package.json');
    }

    const nodePort = course.nodePort ?? this.extractManifest(course.manifest)?.nodePort;
    if (!nodePort) {
      throw new BadRequestException('Node 课件缺少 nodePort');
    }

    const logFile = this.runtimeLogPath(course.slug);
    await mkdir(path.dirname(logFile), { recursive: true });
    await appendFile(
      logFile,
      `\n\n[${new Date().toISOString()}] deploy ${course.slug}\n`,
    );

    await this.prisma.course.update({
      where: { id: course.id },
      data: {
        deploymentStatus: 'DEPLOYING',
        deploymentMessage: '正在安装依赖并构建 Node 课件',
      },
    });

    const env = this.nodeRuntimeEnv(course, nodePort, dto.env);

    try {
      await this.runCommand(
        'npm',
        ['install', '--include=dev', '--no-audit', '--no-fund', '--prefer-offline'],
        serverDir,
        env,
        logFile,
      );
      await this.runCommand('npm', ['run', 'prisma:generate', '--if-present'], serverDir, env, logFile);

      if (
        (await this.pathExists(path.join(serverDir, 'prisma', 'schema.prisma'))) &&
        env.DATABASE_URL
      ) {
        await this.runCommand('npx', ['prisma', 'migrate', 'deploy'], serverDir, env, logFile);
      }

      await this.runCommand('npm', ['run', 'build', '--if-present'], serverDir, env, logFile);
      const pid = await this.startNodeRuntime(course, serverDir, nodePort, env, logFile);

      const updatedCourse = await this.prisma.course.update({
        where: { id: course.id },
        data: {
          deploymentStatus: 'RUNNING',
          deploymentMessage: `Node 课件已运行，pid ${pid}，端口 ${nodePort}`,
          deployedAt: new Date(),
          status: CourseStatus.PUBLISHED,
        },
        include: this.includeRelations(),
      });

      return {
        course: updatedCourse,
        courseRoot,
        serverDir,
        nodePort,
        pid,
        running: true,
        logTail: await this.readRuntimeLogTail(course.slug),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deploy failed';
      const updatedCourse = await this.prisma.course.update({
        where: { id: course.id },
        data: {
          deploymentStatus: 'FAILED',
          deploymentMessage: message,
        },
        include: this.includeRelations(),
      });

      return {
        course: updatedCourse,
        courseRoot,
        serverDir,
        nodePort,
        running: false,
        error: message,
        logTail: await this.readRuntimeLogTail(course.slug),
      };
    }
  }

  async restartRuntime(id: string, dto: DeployCourseRuntimeDto) {
    const course = await this.ensureCourse(id);
    if (course.runtimeType === CourseRuntimeType.STATIC) {
      throw new BadRequestException('静态课件不需要 Node 重启');
    }

    const courseRoot = this.courseRoot(course.slug);
    const serverDir = await this.findNodeServerDir(courseRoot);
    const nodePort = course.nodePort ?? this.extractManifest(course.manifest)?.nodePort;

    if (!serverDir || !nodePort) {
      throw new BadRequestException('Node 课件部署信息不完整');
    }

    const logFile = this.runtimeLogPath(course.slug);
    await mkdir(path.dirname(logFile), { recursive: true });
    await appendFile(
      logFile,
      `\n\n[${new Date().toISOString()}] restart ${course.slug}\n`,
    );

    const env = this.nodeRuntimeEnv(course, nodePort, dto.env);

    try {
      const pid = await this.startNodeRuntime(course, serverDir, nodePort, env, logFile);
      const updatedCourse = await this.prisma.course.update({
        where: { id: course.id },
        data: {
          deploymentStatus: 'RUNNING',
          deploymentMessage: `Node 课件已重启，pid ${pid}，端口 ${nodePort}`,
          deployedAt: new Date(),
          status: CourseStatus.PUBLISHED,
        },
        include: this.includeRelations(),
      });

      return {
        course: updatedCourse,
        courseRoot,
        serverDir,
        nodePort,
        pid,
        running: true,
        logTail: await this.readRuntimeLogTail(course.slug),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Restart failed';
      const updatedCourse = await this.prisma.course.update({
        where: { id: course.id },
        data: {
          deploymentStatus: 'FAILED',
          deploymentMessage: message,
        },
        include: this.includeRelations(),
      });

      return {
        course: updatedCourse,
        courseRoot,
        serverDir,
        nodePort,
        running: false,
        error: message,
        logTail: await this.readRuntimeLogTail(course.slug),
      };
    }
  }

  private async finalizeCourseUpload(
    course: Course,
    writtenFiles: WrittenCourseFile[],
    options: { publish?: boolean; manifestGenerated: boolean },
  ) {
    const courseRoot = this.courseRoot(course.slug);
    const validation = await this.validateManifest(course, courseRoot, options.manifestGenerated);
    const deploymentStatus = this.nextUploadDeploymentStatus(validation, options.publish);
    const shouldPublish =
      options.publish &&
      validation.valid &&
      validation.manifest.runtimeType === CourseRuntimeType.STATIC;

    const updatedCourse = await this.prisma.course.update({
      where: { id: course.id },
      data: {
        runtimeType: validation.manifest.runtimeType,
        entryUrl: validation.entryUrl,
        manifest: validation.manifest as Prisma.InputJsonValue,
        manifestValid: validation.valid,
        manifestErrors: validation.errors,
        deploymentStatus,
        deploymentMessage: validation.valid
          ? this.uploadSuccessMessage(validation)
          : validation.errors.join('；'),
        nodePort: validation.manifest.nodePort,
        uploadedAt: new Date(),
        ...(shouldPublish ? { status: CourseStatus.PUBLISHED } : {}),
      },
      include: this.includeRelations(),
    });

    return {
      course: updatedCourse,
      courseRoot,
      files: writtenFiles,
      manifest: validation.manifest,
      manifestGenerated: validation.generated,
      manifestValid: validation.valid,
      manifestErrors: validation.errors,
      deploymentStatus,
    };
  }

  private includeRelations() {
    return {
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
        },
      },
    } as const;
  }

  private async ensureCourse(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return course;
  }

  private async ensureSlugAvailable(slug: string) {
    const existed = await this.prisma.course.findUnique({ where: { slug } });
    if (existed) {
      throw new BadRequestException('Course slug already exists');
    }
  }

  private normalizeSlug(slug: string) {
    return slug.trim().toLowerCase();
  }

  private courseRoot(courseSlug: string) {
    const configuredRoot = this.config.get<string>('COURSE_RUNTIME_ROOT');
    const runtimeRoot = configuredRoot?.trim() || path.join(process.cwd(), 'course-runtime');
    return path.resolve(runtimeRoot, courseSlug);
  }

  private maxUploadBytes() {
    return Number(this.config.get<string>('COURSE_UPLOAD_MAX_BYTES', String(80 * 1024 * 1024)));
  }

  private agentPublicUrl() {
    return this.config.get<string>('AGENT_PUBLIC_URL', 'http://agent.docpine.online').replace(/\/$/, '');
  }

  private platformPublicUrl() {
    return this.config.get<string>('PLATFORM_PUBLIC_URL', 'http://data.docpine.online').replace(/\/$/, '');
  }

  private sanitizeUploadPath(rawPath: string, courseSlug: string) {
    const cleaned = rawPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
    const parts = cleaned.split('/').filter(Boolean);

    if (parts[0] === courseSlug) {
      parts.shift();
    }

    if (parts.length === 0) {
      throw new BadRequestException('Invalid file path');
    }

    if (
      parts.some((part) =>
        part === '..' ||
        part === '.' ||
        part === 'node_modules' ||
        part === '.git' ||
        part === '.svn',
      )
    ) {
      throw new BadRequestException('Invalid file path');
    }

    if (parts.some((part) => part === '.env' || part.endsWith('.env'))) {
      throw new BadRequestException('Environment files are not allowed');
    }

    const normalized = path.posix.normalize(parts.join('/'));
    if (normalized.startsWith('../') || normalized === '..' || path.posix.isAbsolute(normalized)) {
      throw new BadRequestException('Invalid file path');
    }

    return normalized;
  }

  private decodeBase64(contentBase64: string) {
    const content = contentBase64.replace(/^data:[^;]+;base64,/, '');
    return Buffer.from(content, 'base64');
  }

  private ensureInsideCourseRoot(courseRoot: string, target: string) {
    const resolvedRoot = path.resolve(courseRoot);
    const resolvedTarget = path.resolve(target);
    if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new BadRequestException('Invalid file path');
    }
  }

  private defaultManifest(course: Course): CourseManifest {
    return {
      slug: course.slug,
      title: course.title,
      runtimeType: course.runtimeType,
      entry: '/',
      nodePort: null,
    };
  }

  private async validateManifest(
    course: Course,
    courseRoot: string,
    generated: boolean,
  ): Promise<ManifestValidation> {
    const errors: string[] = [];
    let rawManifest: unknown;

    try {
      rawManifest = await this.readManifestFromDisk(courseRoot);
    } catch {
      rawManifest = this.defaultManifest(course);
      errors.push('缺少 manifest.json，已按课程登记信息生成基础 manifest');
    }

    const manifest = this.coerceManifest(rawManifest, course, errors);

    if (generated && manifest.runtimeType !== CourseRuntimeType.STATIC) {
      errors.push('Node 课件必须提供 manifest.json，不能只依赖系统自动生成');
    }

    if (manifest.slug !== course.slug) {
      errors.push(`manifest.slug 必须等于课程 slug：${course.slug}`);
    }

    if (!manifest.title.trim()) {
      errors.push('manifest.title 不能为空');
    }

    if (!manifest.entry.startsWith('/')) {
      errors.push('manifest.entry 必须以 / 开头');
    }

    if (
      manifest.runtimeType === CourseRuntimeType.STATIC ||
      manifest.runtimeType === CourseRuntimeType.BOTH
    ) {
      const hasStaticEntry =
        (await this.pathExists(path.join(courseRoot, 'static', 'index.html'))) ||
        (await this.pathExists(path.join(courseRoot, 'index.html')));
      if (!hasStaticEntry) {
        errors.push('静态课件需要 static/index.html 或根目录 index.html');
      }
    }

    if (
      manifest.runtimeType === CourseRuntimeType.NODE ||
      manifest.runtimeType === CourseRuntimeType.BOTH
    ) {
      if (!manifest.nodePort || manifest.nodePort < 1024 || manifest.nodePort > 65535) {
        errors.push('Node 课件必须在 manifest.nodePort 设置 1024-65535 的端口');
      }

      if (!(await this.findNodeServerDir(courseRoot))) {
        errors.push('Node 课件需要 server/package.json 或根目录 package.json');
      }
    }

    return {
      manifest,
      valid: errors.length === 0,
      errors,
      generated,
      entryUrl: this.buildCourseEntryUrl(manifest.slug, manifest.entry),
    };
  }

  private async readManifestFromDisk(courseRoot: string) {
    const raw = await readFile(path.join(courseRoot, 'manifest.json'), 'utf8');
    return JSON.parse(raw) as unknown;
  }

  private coerceManifest(
    rawManifest: unknown,
    course: Course,
    errors: string[],
  ): CourseManifest {
    if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
      errors.push('manifest.json 必须是 JSON 对象');
      return this.defaultManifest(course);
    }

    const raw = rawManifest as Record<string, unknown>;
    const runtimeType = this.isCourseRuntimeType(raw.runtimeType)
      ? raw.runtimeType
      : course.runtimeType;

    if (!this.isCourseRuntimeType(raw.runtimeType)) {
      errors.push('manifest.runtimeType 必须是 STATIC、NODE 或 BOTH');
    }

    const nodePort =
      typeof raw.nodePort === 'number' && Number.isInteger(raw.nodePort)
        ? raw.nodePort
        : raw.nodePort === null || raw.nodePort === undefined
          ? null
          : Number(raw.nodePort);

    if (raw.nodePort !== null && raw.nodePort !== undefined && !Number.isInteger(nodePort)) {
      errors.push('manifest.nodePort 必须是整数');
    }

    return {
      slug: typeof raw.slug === 'string' ? raw.slug.trim() : course.slug,
      title: typeof raw.title === 'string' ? raw.title.trim() : course.title,
      runtimeType,
      entry: typeof raw.entry === 'string' ? raw.entry.trim() : '/',
      nodePort: Number.isInteger(nodePort) ? Number(nodePort) : null,
    };
  }

  private extractManifest(rawManifest: Prisma.JsonValue | null): CourseManifest | null {
    if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
      return null;
    }

    const errors: string[] = [];
    return this.coerceManifest(rawManifest, {
      slug: '',
      title: '',
      runtimeType: CourseRuntimeType.STATIC,
      entryUrl: '',
    } as Course, errors);
  }

  private isCourseRuntimeType(value: unknown): value is CourseRuntimeType {
    return (
      value === CourseRuntimeType.STATIC ||
      value === CourseRuntimeType.NODE ||
      value === CourseRuntimeType.BOTH
    );
  }

  private buildCourseEntryUrl(slug: string, entry: string) {
    const normalizedEntry = entry.startsWith('/') ? entry : `/${entry}`;
    return `${this.agentPublicUrl()}/${slug}${normalizedEntry === '/' ? '/' : normalizedEntry}`;
  }

  private nextUploadDeploymentStatus(
    validation: ManifestValidation,
    publish?: boolean,
  ): CourseDeploymentStatus {
    if (!validation.valid) return 'FAILED';
    if (validation.manifest.runtimeType === CourseRuntimeType.STATIC) {
      return publish ? 'STATIC_PUBLISHED' : 'READY';
    }

    return 'READY';
  }

  private uploadSuccessMessage(validation: ManifestValidation) {
    if (validation.manifest.runtimeType === CourseRuntimeType.STATIC) {
      return '静态课件校验通过，可直接发布';
    }

    return 'Node 课件校验通过，等待一键部署';
  }

  private findZipRootPrefix(entryNames: string[]) {
    const paths = entryNames
      .map((name) => name.replace(/\\/g, '/').replace(/^\/+/, ''))
      .filter((name) => name && !this.shouldIgnoreZipEntry(name))
      .map((name) => name.split('/').filter(Boolean));

    if (paths.length === 0 || paths.some((parts) => parts.length < 2)) {
      return null;
    }

    const [prefix] = paths[0];
    return paths.every((parts) => parts[0] === prefix) ? prefix : null;
  }

  private shouldIgnoreZipEntry(entryName: string) {
    const normalized = entryName.replace(/\\/g, '/').replace(/^\/+/, '');
    return (
      normalized.startsWith('__MACOSX/') ||
      normalized.endsWith('/.DS_Store') ||
      normalized === '.DS_Store' ||
      normalized.split('/').some((part) => part.startsWith('._'))
    );
  }

  private async findNodeServerDir(courseRoot: string) {
    const serverDir = path.join(courseRoot, 'server');
    if (await this.pathExists(path.join(serverDir, 'package.json'))) {
      return serverDir;
    }

    if (await this.pathExists(path.join(courseRoot, 'package.json'))) {
      return courseRoot;
    }

    return null;
  }

  private nodeRuntimeEnv(
    course: Course,
    nodePort: number,
    extraEnv: Record<string, string> | undefined,
  ): NodeJS.ProcessEnv {
    const storedEnv = this.readCourseRuntimeEnv(course.slug);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...storedEnv,
      ...(extraEnv ?? {}),
      NODE_ENV: 'production',
      PORT: String(nodePort),
      HOST: '127.0.0.1',
      HOSTNAME: '127.0.0.1',
      COURSE_SLUG: course.slug,
      NEXT_PUBLIC_COURSE_BASE_PATH: `/${course.slug}`,
      PLATFORM_PUBLIC_URL: this.platformPublicUrl(),
      PLATFORM_API_BASE_URL: `${this.platformPublicUrl()}/api/v1`,
      COURSEWARE_PUBLIC_URL: `${this.agentPublicUrl()}/${course.slug}`,
      NPM_CONFIG_CACHE: path.join(this.runtimeStateDir(course.slug), 'npm-cache'),
    };

    if (!storedEnv.DATABASE_URL && !extraEnv?.DATABASE_URL) {
      delete env.DATABASE_URL;
    }

    return env;
  }

  private readCourseRuntimeEnv(courseSlug: string): Record<string, string> {
    try {
      const raw = readFileSync(path.join(this.runtimeStateDir(courseSlug), 'env.json'), 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }

      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => (
          typeof entry[0] === 'string' && typeof entry[1] === 'string'
        )),
      );
    } catch {
      return {};
    }
  }

  private async runCommand(
    command: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    logFile: string,
  ) {
    await appendFile(logFile, `\n$ ${command} ${args.join(' ')}\n`);

    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env,
        shell: false,
      });
      let output = '';

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        void appendFile(logFile, text);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        void appendFile(logFile, text);
      });

      child.on('error', (error) => reject(error));
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        const tail = output.slice(-1200);
        reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}: ${tail}`));
      });
    });
  }

  private async startNodeRuntime(
    course: Course,
    serverDir: string,
    nodePort: number,
    env: NodeJS.ProcessEnv,
    logFile: string,
  ) {
    await this.stopNodeRuntime(course.slug, nodePort);

    const logFd = openSync(logFile, 'a');
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('npm', ['run', 'start'], {
        cwd: serverDir,
        env,
        detached: true,
        stdio: ['ignore', logFd, logFd],
      });
    } finally {
      closeSync(logFd);
    }

    if (!child.pid) {
      throw new Error('Node 课件启动失败：没有获取到进程号');
    }

    let exitState: { code: number | null; signal: NodeJS.Signals | null } | null = null;
    child.once('exit', (code, signal) => {
      exitState = { code, signal };
    });

    child.unref();

    await writeFile(this.runtimePidPath(course.slug), `${child.pid}\n`);
    await this.waitForRuntimePort(nodePort, () => exitState);
    return child.pid;
  }

  private async stopNodeRuntime(courseSlug: string, nodePort?: number) {
    const pid = await this.readRuntimePid(courseSlug);
    if (pid) {
      await this.terminatePid(pid);
    }

    if (nodePort) {
      const portPids = await this.findPidsByPort(nodePort);
      await Promise.all(portPids.map((portPid) => this.terminatePid(portPid)));
      await this.waitForPortFree(nodePort);
    }
  }

  private async terminatePid(pid: number) {
    if (!this.isPidRunning(pid)) {
      return;
    }

    this.killProcessGroup(pid, 'SIGTERM');
    this.killProcess(pid, 'SIGTERM');

    await new Promise((resolve) => setTimeout(resolve, 800));
    if (this.isPidRunning(pid)) {
      this.killProcessGroup(pid, 'SIGKILL');
      this.killProcess(pid, 'SIGKILL');
    }
  }

  private killProcess(pid: number, signal: NodeJS.Signals) {
    try {
      process.kill(pid, signal);
    } catch {
      // Process may already have exited.
    }
  }

  private killProcessGroup(pid: number, signal: NodeJS.Signals) {
    try {
      process.kill(-pid, signal);
    } catch {
      // Not every pid is a process group leader.
    }
  }

  private async findPidsByPort(port: number) {
    return new Promise<number[]>((resolve) => {
      const child = spawn('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { shell: false });
      let output = '';

      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });

      child.on('error', () => resolve([]));
      child.on('close', () => {
        const pids = output
          .split(/\s+/)
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item) && item > 0);
        resolve([...new Set(pids)]);
      });
    });
  }

  private async waitForPortFree(port: number) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5000) {
      const pids = await this.findPidsByPort(port);
      if (pids.length === 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(`Node 课件端口 ${port} 被旧进程占用，无法释放`);
  }

  private async waitForRuntimePort(
    port: number,
    getExitState: () => { code: number | null; signal: NodeJS.Signals | null } | null,
  ) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 15000) {
      const pids = await this.findPidsByPort(port);
      if (pids.length > 0) {
        return;
      }

      const exitState = getExitState();
      if (exitState) {
        throw new Error(
          `Node 课件启动失败：进程已退出，code=${exitState.code ?? 'null'}，signal=${exitState.signal ?? 'null'}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`Node 课件启动超时：端口 ${port} 未监听`);
  }

  private runtimeStateDir(courseSlug: string) {
    return path.join(this.courseRoot(courseSlug), '.runtime');
  }

  private runtimePidPath(courseSlug: string) {
    return path.join(this.runtimeStateDir(courseSlug), 'node.pid');
  }

  private runtimeLogPath(courseSlug: string) {
    return path.join(this.runtimeStateDir(courseSlug), 'deploy.log');
  }

  private async readRuntimePid(courseSlug: string) {
    try {
      const raw = await readFile(this.runtimePidPath(courseSlug), 'utf8');
      const pid = Number(raw.trim());
      return Number.isInteger(pid) ? pid : null;
    } catch {
      return null;
    }
  }

  private isPidRunning(pid: number) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async readRuntimeLogTail(courseSlug: string) {
    try {
      const raw = await readFile(this.runtimeLogPath(courseSlug), 'utf8');
      return raw.slice(-4000);
    } catch {
      return '';
    }
  }

  private async pathExists(target: string) {
    try {
      await access(target);
      return true;
    } catch {
      return false;
    }
  }
}
