import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Course,
  CourseAssignmentStatus,
  Courseware,
  CourseOwnerType,
  CourseRuntimeType,
  CourseStatus,
  CourseTeachingStatus,
  Prisma,
  UserApprovalStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import AdmZip from 'adm-zip';
import { spawn } from 'child_process';
import { closeSync, openSync, readFileSync } from 'fs';
import { access, appendFile, mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { WorkItemsService } from '../work-items/work-items.service';
import { CreateAdminCourseAssignmentDto } from './dto/create-admin-course-assignment.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateCoursewareDto } from './dto/create-courseware.dto';
import { DeployCourseRuntimeDto } from './dto/deploy-course-runtime.dto';
import { UpdateCoursewareOrderDto } from './dto/update-courseware-order.dto';
import { UpdateCoursewareDto } from './dto/update-courseware.dto';
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

type CoursewareWithCourse = Courseware & { course: Course };
type RuntimeTarget = string | Course | CoursewareWithCourse;
type RuntimeHealth = {
  pid: number | null;
  running: boolean;
  serviceName: string | null;
  systemdActive: boolean | null;
  systemdManaged: boolean;
};

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly workItems: WorkItemsService,
  ) {}

  async create(dto: CreateCourseDto, createdByUserId: string) {
    const slug = dto.slug?.trim()
      ? this.normalizeSlug(dto.slug)
      : await this.generateAvailableCourseSlug(dto.title);
    await this.ensureSlugAvailable(slug);

    const course = await this.prisma.course.create({
      data: {
        slug,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        runtimeType: CourseRuntimeType.STATIC,
        entryUrl: this.buildCourseContainerUrl(slug),
        ownerType: dto.ownerType ?? CourseOwnerType.ADMIN,
        createdByUserId,
      },
      include: this.includeRelations(),
    });

    return this.toCourseResponse(course);
  }

  async findMany() {
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: this.includeRelations(),
      take: 200,
    });

    return courses.map((course) => this.toCourseResponse(course));
  }

  async findById(id: string) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
      include: this.includeRelations(),
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return this.toCourseResponse(course);
  }

  async update(id: string, dto: UpdateCourseDto) {
    await this.ensureCourse(id);

    if (dto.slug) {
      const slug = this.normalizeSlug(dto.slug);
      const existed = await this.prisma.course.findUnique({ where: { slug } });
      if (existed && existed.id !== id) {
        throw new BadRequestException('课程访问短名已存在');
      }
    }

    const course = await this.prisma.course.update({
      where: { id },
      data: {
        ...(dto.slug ? { slug: this.normalizeSlug(dto.slug) } : {}),
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.slug ? { entryUrl: this.buildCourseContainerUrl(this.normalizeSlug(dto.slug)) } : {}),
        ...(dto.ownerType ? { ownerType: dto.ownerType } : {}),
      },
      include: this.includeRelations(),
    });

    return this.toCourseResponse(course);
  }

  async updateStatus(id: string, status: CourseStatus) {
    await this.ensureCourse(id);

    const course = await this.prisma.course.update({
      where: { id },
      data: { status },
      include: this.includeRelations(),
    });

    return this.toCourseResponse(course);
  }

  async listAssignments() {
    const assignments = await this.prisma.courseAssignment.findMany({
      where: {
        course: { deletedAt: null },
        class: { deletedAt: null, organization: { deletedAt: null } },
      },
      orderBy: { createdAt: 'desc' },
      include: this.assignmentInclude(),
      take: 300,
    });

    return { assignments: assignments.map((assignment) => this.toAssignment(assignment)) };
  }

  async createAssignment(dto: CreateAdminCourseAssignmentDto) {
    const course = await this.prisma.course.findFirst({
      where: { id: dto.courseId, deletedAt: null },
    });
    if (!course || course.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException('Published course not found');
    }

    const publishedCoursewareCount = await this.prisma.courseCourseware.count({
      where: {
        courseId: course.id,
        courseware: { status: CourseStatus.PUBLISHED, deletedAt: null },
      },
    });
    if (publishedCoursewareCount === 0) {
      throw new BadRequestException('课程下没有已发布课件，暂不能布置');
    }

    const classRecord = await this.prisma.class.findFirst({
      where: {
        id: dto.classId,
        deletedAt: null,
        organization: { deletedAt: null },
      },
    });
    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }

    const teacher = await this.prisma.user.findFirst({
      where: {
        id: dto.teacherId,
        deletedAt: null,
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
        approvalStatus: UserApprovalStatus.APPROVED,
      },
    });
    if (!teacher) {
      throw new BadRequestException('负责老师不存在，或不是已审核启用的教师');
    }

    const startAt = new Date(dto.startAt);
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (Number.isNaN(startAt.getTime()) || (dueAt && Number.isNaN(dueAt.getTime()))) {
      throw new BadRequestException('计划时间格式无效');
    }
    if (dueAt && dueAt <= startAt) {
      throw new BadRequestException('计划结束时间必须晚于计划上课时间');
    }

    const assignment = await this.prisma.courseAssignment.create({
      data: {
        courseId: course.id,
        classId: classRecord.id,
        teacherId: teacher.id,
        title: dto.title.trim(),
        instructions: dto.instructions?.trim() || null,
        startAt,
        dueAt,
      },
      include: this.assignmentInclude(),
    });

    return this.toAssignment(assignment);
  }

  async createCourseware(courseId: string, dto: CreateCoursewareDto) {
    const course = await this.ensureCourse(courseId);
    const slug = dto.slug?.trim()
      ? this.normalizeSlug(dto.slug)
      : await this.generateAvailableCoursewareSlug(course.id, dto.title);
    await this.ensureCoursewareSlugAvailable(course.id, slug);

    const sortOrder = dto.sortOrder ?? await this.nextCoursewareSortOrder(course.id);
    const runtimeType = dto.runtimeType ?? CourseRuntimeType.STATIC;
    const nodePort = await this.resolveNodePort(runtimeType, dto.nodePort);

    const courseware = await this.prisma.courseware.create({
      data: {
        courseId: course.id,
        slug,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        sortOrder,
        runtimeType,
        entryUrl: this.buildCoursewareEntryUrl(course.slug, slug, '/'),
        nodePort,
      },
      include: this.includeCoursewareRelations(),
    });

    await this.prisma.courseCourseware.create({
      data: {
        courseId: course.id,
        coursewareId: courseware.id,
        sortOrder,
      },
    });

    return this.withCoursewarePublicUrl(courseware);
  }

  async listCoursewares(courseId: string) {
    await this.ensureCourse(courseId);
    const links = await this.prisma.courseCourseware.findMany({
      where: {
        courseId,
        courseware: { deletedAt: null, course: { deletedAt: null } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        courseware: {
          include: this.includeCoursewareRelations(),
        },
      },
    });

    return links.map((link) => this.coursewareFromLink(link));
  }

  async listAllCoursewares() {
    const coursewares = await this.prisma.courseware.findMany({
      where: { deletedAt: null, course: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      include: this.includeCoursewareRelations(),
      take: 300,
    });

    return coursewares.map((courseware) => this.withCoursewarePublicUrl(courseware));
  }

  async updateCourseware(id: string, dto: UpdateCoursewareDto) {
    const courseware = await this.ensureCourseware(id);
    const nextSlug = dto.slug ? this.normalizeSlug(dto.slug) : undefined;
    const nextRuntimeType = dto.runtimeType ?? courseware.runtimeType;
    const shouldResolveNodePort = dto.runtimeType !== undefined || dto.nodePort !== undefined;
    const nextNodePort = shouldResolveNodePort
      ? await this.resolveNodePort(nextRuntimeType, dto.nodePort, courseware.nodePort ?? undefined)
      : undefined;

    if (nextSlug && nextSlug !== courseware.slug) {
      if (courseware.uploadedAt) {
        throw new BadRequestException('已上传课件不能修改访问短名');
      }
      await this.ensureCoursewareSlugAvailable(courseware.courseId, nextSlug, id);
    }

    const updatedCourseware = await this.prisma.courseware.update({
      where: { id },
      data: {
        ...(nextSlug ? { slug: nextSlug } : {}),
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.runtimeType ? { runtimeType: dto.runtimeType } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(nextNodePort !== undefined ? { nodePort: nextNodePort } : {}),
        ...(nextSlug
          ? { entryUrl: this.buildCoursewareEntryUrl(courseware.course.slug, nextSlug, '/') }
          : {}),
      },
      include: this.includeCoursewareRelations(),
    });

    return this.withCoursewarePublicUrl(updatedCourseware);
  }

  async updateCoursewareStatus(id: string, status: CourseStatus) {
    await this.ensureCourseware(id);
    const courseware = await this.prisma.courseware.update({
      where: { id },
      data: { status },
      include: this.includeCoursewareRelations(),
    });
    return this.withCoursewarePublicUrl(courseware);
  }

  async selectCoursewares(courseId: string, coursewareIds: string[]) {
    await this.ensureCourse(courseId);
    const uniqueIds = Array.from(new Set(coursewareIds));

    if (uniqueIds.length !== coursewareIds.length) {
      throw new BadRequestException('不能重复选择同一个课件');
    }

    if (uniqueIds.length > 10) {
      throw new BadRequestException('一门课程最多选择 10 个课件');
    }

    const coursewares = uniqueIds.length
      ? await this.prisma.courseware.findMany({
          where: {
            id: { in: uniqueIds },
            deletedAt: null,
            course: { deletedAt: null },
          },
          select: { id: true },
        })
      : [];

    if (coursewares.length !== uniqueIds.length) {
      throw new BadRequestException('选择列表包含不存在或已删除的课件');
    }

    await this.prisma.$transaction([
      this.prisma.courseCourseware.deleteMany({
        where: {
          courseId,
          ...(uniqueIds.length ? { coursewareId: { notIn: uniqueIds } } : {}),
        },
      }),
      ...uniqueIds.map((coursewareId, index) =>
        this.prisma.courseCourseware.upsert({
          where: {
            courseId_coursewareId: {
              courseId,
              coursewareId,
            },
          },
          create: {
            courseId,
            coursewareId,
            sortOrder: (index + 1) * 10,
          },
          update: {
            sortOrder: (index + 1) * 10,
          },
        }),
      ),
    ]);

    return this.listCoursewares(courseId);
  }

  async updateCoursewareOrder(courseId: string, dto: UpdateCoursewareOrderDto) {
    await this.ensureCourse(courseId);
    const ids = dto.items.map((item) => item.id);
    const count = await this.prisma.courseCourseware.count({
      where: { courseId, coursewareId: { in: ids }, courseware: { deletedAt: null } },
    });

    if (count !== ids.length) {
      throw new BadRequestException('课件排序列表包含当前课程未选择的课件');
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.courseCourseware.update({
          where: {
            courseId_coursewareId: {
              courseId,
              coursewareId: item.id,
            },
          },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    return this.listCoursewares(courseId);
  }

  async moveCourseToRecycleBin(id: string) {
    const course = await this.ensureCourse(id);
    const deletedAt = new Date();

    const [deletedCourse] = await this.prisma.$transaction([
      this.prisma.course.update({
        where: { id: course.id },
        data: {
          deletedAt,
          status: CourseStatus.ARCHIVED,
          coursewares: {
            updateMany: {
              where: { deletedAt: null },
              data: { deletedAt, status: CourseStatus.ARCHIVED },
            },
          },
        },
        include: this.includeRelations(),
      }),
      this.prisma.courseAssignment.updateMany({
        where: { courseId: course.id, status: CourseAssignmentStatus.ACTIVE },
        data: { status: CourseAssignmentStatus.ARCHIVED },
      }),
    ]);

    return deletedCourse;
  }

  async restoreCourse(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course || !course.deletedAt) {
      throw new NotFoundException('Deleted course not found');
    }

    return this.prisma.course.update({
      where: { id: course.id },
      data: { deletedAt: null },
      include: this.includeRelations(),
    });
  }

  async permanentlyDeleteCourse(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course || !course.deletedAt) {
      throw new NotFoundException('Deleted course not found');
    }

    await this.prisma.course.delete({ where: { id: course.id } });
    await rm(this.courseRoot(course.slug), { recursive: true, force: true });

    return { id: course.id, deleted: true };
  }

  async moveCoursewareToRecycleBin(id: string) {
    const courseware = await this.ensureCourseware(id);

    return this.prisma.courseware.update({
      where: { id: courseware.id },
      data: {
        deletedAt: new Date(),
        status: CourseStatus.ARCHIVED,
      },
      include: this.includeCoursewareRelations(),
    });
  }

  async restoreCourseware(id: string) {
    const courseware = await this.prisma.courseware.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!courseware || !courseware.deletedAt) {
      throw new NotFoundException('Deleted courseware not found');
    }
    if (courseware.course.deletedAt) {
      throw new BadRequestException('请先恢复所属课程，再恢复该课件');
    }

    return this.prisma.courseware.update({
      where: { id: courseware.id },
      data: { deletedAt: null },
      include: this.includeCoursewareRelations(),
    });
  }

  async permanentlyDeleteCourseware(id: string) {
    const courseware = await this.prisma.courseware.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!courseware || !courseware.deletedAt) {
      throw new NotFoundException('Deleted courseware not found');
    }

    await this.prisma.courseware.delete({ where: { id: courseware.id } });
    await rm(this.coursewareRoot(courseware), { recursive: true, force: true });

    return { id: courseware.id, deleted: true };
  }

  async getCoursewareManifest(id: string) {
    const courseware = await this.ensureCourseware(id);
    const root = this.coursewareRoot(courseware);
    const fileManifest = await this.readManifestFromDisk(root).catch(() => null);

    return {
      course: courseware.course,
      courseware: this.withCoursewarePublicUrl(courseware),
      courseRoot: this.courseRoot(courseware.course.slug),
      coursewareRoot: root,
      manifest: courseware.manifest ?? fileManifest,
      manifestValid: courseware.manifestValid,
      manifestErrors: courseware.manifestErrors,
      deploymentStatus: courseware.deploymentStatus,
      deploymentMessage: courseware.deploymentMessage,
      nodePort: courseware.nodePort,
      uploadedAt: courseware.uploadedAt,
      deployedAt: courseware.deployedAt,
    };
  }

  async getCoursewareRuntimeStatus(id: string) {
    const courseware = await this.ensureCourseware(id);
    const health = await this.resolveRuntimeHealth(courseware, courseware.nodePort);
    let deploymentStatus = courseware.deploymentStatus as CourseDeploymentStatus;
    let deploymentMessage = courseware.deploymentMessage;

    if (
      (courseware.runtimeType === CourseRuntimeType.NODE ||
        courseware.runtimeType === CourseRuntimeType.BOTH) &&
      deploymentStatus === 'RUNNING' &&
      !health.running
    ) {
      deploymentStatus = 'STOPPED';
      deploymentMessage = health.systemdManaged
        ? `Node 课件 systemd 服务未运行：${health.serviceName}`
        : 'Node 课件进程未运行';
      await this.prisma.courseware.update({
        where: { id: courseware.id },
        data: {
          deploymentStatus,
          deploymentMessage,
        },
      });
    }

    return {
      course: courseware.course,
      courseware: await this.findCoursewareById(id),
      courseRoot: this.courseRoot(courseware.course.slug),
      coursewareRoot: this.coursewareRoot(courseware),
      manifest: courseware.manifest,
      manifestValid: courseware.manifestValid,
      manifestErrors: courseware.manifestErrors,
      deploymentStatus,
      deploymentMessage,
      nodePort: courseware.nodePort,
      pid: health.pid,
      running: health.running,
      serviceName: health.serviceName,
      systemdActive: health.systemdActive,
      systemdManaged: health.systemdManaged,
      logTail: await this.readRuntimeLogTail(courseware),
    };
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
    const health = await this.resolveRuntimeHealth(course, course.nodePort);
    let deploymentStatus = course.deploymentStatus as CourseDeploymentStatus;
    let deploymentMessage = course.deploymentMessage;

    if (
      (course.runtimeType === CourseRuntimeType.NODE ||
        course.runtimeType === CourseRuntimeType.BOTH) &&
      deploymentStatus === 'RUNNING' &&
      !health.running
    ) {
      deploymentStatus = 'STOPPED';
      deploymentMessage = health.systemdManaged
        ? `Node 课件 systemd 服务未运行：${health.serviceName}`
        : 'Node 课件进程未运行';
      await this.prisma.course.update({
        where: { id: course.id },
        data: {
          deploymentStatus,
          deploymentMessage,
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
      deploymentMessage,
      nodePort: course.nodePort,
      pid: health.pid,
      running: health.running,
      serviceName: health.serviceName,
      systemdActive: health.systemdActive,
      systemdManaged: health.systemdManaged,
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

  async uploadCoursewareFiles(id: string, dto: UploadCourseFilesDto) {
    const courseware = await this.ensureCourseware(id);
    if (dto.files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }

    const root = this.coursewareRoot(courseware);
    await mkdir(root, { recursive: true });

    let totalBytes = 0;
    let manifestGenerated = false;
    let hasManifest = false;
    const writtenFiles: WrittenCourseFile[] = [];

    for (const file of dto.files) {
      const relativePath = this.sanitizeUploadPath(
        file.path,
        courseware.course.slug,
        courseware.slug,
      );
      const content = this.decodeBase64(file.contentBase64);
      totalBytes += content.byteLength;

      if (totalBytes > this.maxUploadBytes()) {
        throw new BadRequestException('Courseware upload exceeds size limit');
      }

      const target = path.join(root, relativePath);
      this.ensureInsideCourseRoot(root, target);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
      writtenFiles.push({ path: relativePath, bytes: content.byteLength });
      hasManifest ||= relativePath === 'manifest.json';
    }

    if (!hasManifest) {
      const manifest = this.defaultCoursewareManifest(courseware);
      const manifestPath = path.join(root, 'manifest.json');
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      manifestGenerated = true;
      writtenFiles.push({
        path: 'manifest.json',
        bytes: Buffer.byteLength(JSON.stringify(manifest)),
      });
    }

    return this.finalizeCoursewareUpload(courseware, writtenFiles, {
      publish: dto.publish,
      manifestGenerated,
    });
  }

  async uploadCoursewareZip(id: string, dto: UploadCourseZipDto) {
    const courseware = await this.ensureCourseware(id);
    const zipBuffer = this.decodeBase64(dto.contentBase64);

    if (zipBuffer.byteLength > this.maxUploadBytes()) {
      throw new BadRequestException('Courseware upload exceeds size limit');
    }

    if (!dto.fileName.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('Only .zip files are allowed');
    }

    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    const rootPrefix = this.findZipRootPrefix(entries.map((entry) => entry.entryName));
    const root = this.coursewareRoot(courseware);
    const writtenFiles: WrittenCourseFile[] = [];
    let totalBytes = 0;
    let hasManifest = false;

    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });

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

      const relativePath = this.sanitizeUploadPath(
        entryName,
        courseware.course.slug,
        courseware.slug,
      );
      const content = entry.getData();
      totalBytes += content.byteLength;

      if (totalBytes > this.maxUploadBytes()) {
        throw new BadRequestException('Courseware upload exceeds size limit');
      }

      const target = path.join(root, relativePath);
      this.ensureInsideCourseRoot(root, target);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
      writtenFiles.push({ path: relativePath, bytes: content.byteLength });
      hasManifest ||= relativePath === 'manifest.json';
    }

    if (writtenFiles.length === 0) {
      throw new BadRequestException('ZIP does not contain courseware files');
    }

    let manifestGenerated = false;
    if (!hasManifest) {
      const manifest = this.defaultCoursewareManifest(courseware);
      const manifestPath = path.join(root, 'manifest.json');
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      manifestGenerated = true;
      writtenFiles.push({
        path: 'manifest.json',
        bytes: Buffer.byteLength(JSON.stringify(manifest)),
      });
    }

    return this.finalizeCoursewareUpload(courseware, writtenFiles, {
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

    const nodePort = await this.resolveNodePort(
      course.runtimeType,
      course.nodePort ?? undefined,
    );
    if (!nodePort) {
      throw new BadRequestException('Node 课件缺少 nodePort');
    }
    await this.persistCourseNodePortIfNeeded(course, nodePort);

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

  async deployCoursewareRuntime(id: string, dto: DeployCourseRuntimeDto) {
    const courseware = await this.ensureCourseware(id);
    if (courseware.runtimeType === CourseRuntimeType.STATIC) {
      throw new BadRequestException('静态课件不需要 Node 部署');
    }

    if (!courseware.manifestValid) {
      throw new BadRequestException('manifest 校验未通过，不能部署');
    }

    const root = this.coursewareRoot(courseware);
    const serverDir = await this.findNodeServerDir(root);
    if (!serverDir) {
      throw new BadRequestException('Node 课件需要 server/package.json 或根目录 package.json');
    }

    const nodePort = await this.resolveNodePort(
      courseware.runtimeType,
      courseware.nodePort ?? undefined,
    );
    if (!nodePort) {
      throw new BadRequestException('Node 课件缺少 nodePort');
    }
    await this.persistCoursewareNodePortIfNeeded(courseware, nodePort);

    const logFile = this.runtimeLogPath(courseware);
    await mkdir(path.dirname(logFile), { recursive: true });
    await appendFile(
      logFile,
      `\n\n[${new Date().toISOString()}] deploy ${courseware.course.slug}/${courseware.slug}\n`,
    );

    await this.prisma.courseware.update({
      where: { id: courseware.id },
      data: {
        deploymentStatus: 'DEPLOYING',
        deploymentMessage: '正在安装依赖并构建 Node 课件',
      },
    });

    const env = this.nodeRuntimeEnv(courseware, nodePort, dto.env);

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
      const pid = await this.startNodeRuntime(courseware, serverDir, nodePort, env, logFile);

      const updatedCourseware = await this.prisma.courseware.update({
        where: { id: courseware.id },
        data: {
          deploymentStatus: 'RUNNING',
          deploymentMessage: `Node 课件已运行，pid ${pid}，端口 ${nodePort}`,
          deployedAt: new Date(),
          status: CourseStatus.PUBLISHED,
        },
        include: this.includeCoursewareRelations(),
      });

      return {
        course: updatedCourseware.course,
        courseware: updatedCourseware,
        courseRoot: this.courseRoot(updatedCourseware.course.slug),
        coursewareRoot: root,
        serverDir,
        nodePort,
        pid,
        running: true,
        logTail: await this.readRuntimeLogTail(updatedCourseware),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deploy failed';
      const updatedCourseware = await this.prisma.courseware.update({
        where: { id: courseware.id },
        data: {
          deploymentStatus: 'FAILED',
          deploymentMessage: message,
        },
        include: this.includeCoursewareRelations(),
      });
      await this.workItems
        .createCoursewareDeploymentFailed(updatedCourseware.id, message)
        .catch(() => undefined);

      return {
        course: updatedCourseware.course,
        courseware: updatedCourseware,
        courseRoot: this.courseRoot(updatedCourseware.course.slug),
        coursewareRoot: root,
        serverDir,
        nodePort,
        running: false,
        error: message,
        logTail: await this.readRuntimeLogTail(updatedCourseware),
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
    const nodePort = await this.resolveNodePort(
      course.runtimeType,
      course.nodePort ?? undefined,
    );

    if (!serverDir || !nodePort) {
      throw new BadRequestException('Node 课件部署信息不完整');
    }
    await this.persistCourseNodePortIfNeeded(course, nodePort);

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

  async restartCoursewareRuntime(id: string, dto: DeployCourseRuntimeDto) {
    const courseware = await this.ensureCourseware(id);
    if (courseware.runtimeType === CourseRuntimeType.STATIC) {
      throw new BadRequestException('静态课件不需要 Node 重启');
    }

    const root = this.coursewareRoot(courseware);
    const serverDir = await this.findNodeServerDir(root);
    const nodePort = await this.resolveNodePort(
      courseware.runtimeType,
      courseware.nodePort ?? undefined,
    );

    if (!serverDir || !nodePort) {
      throw new BadRequestException('Node 课件部署信息不完整');
    }
    await this.persistCoursewareNodePortIfNeeded(courseware, nodePort);

    const logFile = this.runtimeLogPath(courseware);
    await mkdir(path.dirname(logFile), { recursive: true });
    await appendFile(
      logFile,
      `\n\n[${new Date().toISOString()}] restart ${courseware.course.slug}/${courseware.slug}\n`,
    );

    const env = this.nodeRuntimeEnv(courseware, nodePort, dto.env);

    try {
      const pid = await this.startNodeRuntime(courseware, serverDir, nodePort, env, logFile);
      const updatedCourseware = await this.prisma.courseware.update({
        where: { id: courseware.id },
        data: {
          deploymentStatus: 'RUNNING',
          deploymentMessage: `Node 课件已重启，pid ${pid}，端口 ${nodePort}`,
          deployedAt: new Date(),
          status: CourseStatus.PUBLISHED,
        },
        include: this.includeCoursewareRelations(),
      });

      return {
        course: updatedCourseware.course,
        courseware: updatedCourseware,
        courseRoot: this.courseRoot(updatedCourseware.course.slug),
        coursewareRoot: root,
        serverDir,
        nodePort,
        pid,
        running: true,
        logTail: await this.readRuntimeLogTail(updatedCourseware),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Restart failed';
      const updatedCourseware = await this.prisma.courseware.update({
        where: { id: courseware.id },
        data: {
          deploymentStatus: 'FAILED',
          deploymentMessage: message,
        },
        include: this.includeCoursewareRelations(),
      });
      await this.workItems
        .createCoursewareDeploymentFailed(updatedCourseware.id, message)
        .catch(() => undefined);

      return {
        course: updatedCourseware.course,
        courseware: updatedCourseware,
        courseRoot: this.courseRoot(updatedCourseware.course.slug),
        coursewareRoot: root,
        serverDir,
        nodePort,
        running: false,
        error: message,
        logTail: await this.readRuntimeLogTail(updatedCourseware),
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
    const nodePort = await this.resolveNodePort(
      validation.manifest.runtimeType,
      course.nodePort ?? undefined,
    );
    const manifest = { ...validation.manifest, nodePort };

    const updatedCourse = await this.prisma.course.update({
      where: { id: course.id },
      data: {
        runtimeType: manifest.runtimeType,
        entryUrl: validation.entryUrl,
        manifest: manifest as Prisma.InputJsonValue,
        manifestValid: validation.valid,
        manifestErrors: validation.errors,
        deploymentStatus,
        deploymentMessage: validation.valid
          ? this.uploadSuccessMessage(validation)
          : validation.errors.join('；'),
        nodePort,
        uploadedAt: new Date(),
        ...(shouldPublish ? { status: CourseStatus.PUBLISHED } : {}),
      },
      include: this.includeRelations(),
    });

    return {
      course: updatedCourse,
      courseRoot,
      files: writtenFiles,
      manifest,
      manifestGenerated: validation.generated,
      manifestValid: validation.valid,
      manifestErrors: validation.errors,
      deploymentStatus,
    };
  }

  private async finalizeCoursewareUpload(
    courseware: CoursewareWithCourse,
    writtenFiles: WrittenCourseFile[],
    options: { publish?: boolean; manifestGenerated: boolean },
  ) {
    const root = this.coursewareRoot(courseware);
    const validation = await this.validateCoursewareManifest(
      courseware,
      root,
      options.manifestGenerated,
    );
    const deploymentStatus = this.nextUploadDeploymentStatus(validation, options.publish);
    const shouldPublish =
      options.publish &&
      validation.valid &&
      validation.manifest.runtimeType === CourseRuntimeType.STATIC;
    const nodePort = await this.resolveNodePort(
      validation.manifest.runtimeType,
      courseware.nodePort ?? undefined,
    );
    const manifest = { ...validation.manifest, nodePort };

    const updatedCourseware = await this.prisma.courseware.update({
      where: { id: courseware.id },
      data: {
        runtimeType: manifest.runtimeType,
        entryUrl: validation.entryUrl,
        manifest: manifest as Prisma.InputJsonValue,
        manifestValid: validation.valid,
        manifestErrors: validation.errors,
        deploymentStatus,
        deploymentMessage: validation.valid
          ? this.uploadSuccessMessage(validation)
          : validation.errors.join('；'),
        nodePort,
        uploadedAt: new Date(),
        ...(shouldPublish ? { status: CourseStatus.PUBLISHED } : {}),
      },
      include: this.includeCoursewareRelations(),
    });

    return {
      course: updatedCourseware.course,
      courseware: updatedCourseware,
      courseRoot: this.courseRoot(updatedCourseware.course.slug),
      coursewareRoot: root,
      files: writtenFiles,
      manifest,
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
          coursewares: true,
          coursewareLinks: true,
        },
      },
      coursewareLinks: {
        where: {
          courseware: {
            deletedAt: null,
            course: { deletedAt: null },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          courseware: {
            include: {
              ...this.includeCoursewareRelations(),
            },
          },
        },
      },
    } satisfies Prisma.CourseInclude;
  }

  private assignmentInclude() {
    return {
      course: {
        include: {
          coursewareLinks: {
            where: { courseware: { status: CourseStatus.PUBLISHED, deletedAt: null } },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            include: { courseware: true },
          },
        },
      },
      class: {
        include: {
          organization: true,
        },
      },
      teacher: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
      _count: {
        select: { learningRecords: true },
      },
    } satisfies Prisma.CourseAssignmentInclude;
  }

  private toCourseResponse(course: Prisma.CourseGetPayload<{
    include: ReturnType<CoursesService['includeRelations']>;
  }>) {
    const selectedCoursewares = course.coursewareLinks.map((link) => this.coursewareFromLink(link));
    const { coursewareLinks, ...rest } = course;

    return {
      ...rest,
      coursewares: selectedCoursewares,
      _count: {
        ...course._count,
        coursewares: selectedCoursewares.length,
      },
    };
  }

  private coursewareFromLink(link: {
    sortOrder: number;
    courseware: Courseware & {
      course: Course;
      _count?: {
        learningRecords: number;
        launchSessions: number;
      };
    };
  }) {
    return {
      ...this.withCoursewarePublicUrl(link.courseware),
      sortOrder: link.sortOrder,
    };
  }

  private withCoursewarePublicUrl<T extends Courseware & { course: Course }>(courseware: T) {
    return {
      ...courseware,
      entryUrl: this.buildCoursewareEntryUrl(
        courseware.course.slug,
        courseware.slug,
        this.manifestEntry(courseware.manifest),
      ),
    };
  }

  private toAssignment(assignment: {
    id: string;
    title: string;
    instructions: string | null;
    startAt: Date | null;
    dueAt: Date | null;
    status: CourseAssignmentStatus;
    teachingStatus: CourseTeachingStatus;
    openedAt: Date | null;
    closedAt: Date | null;
    openedByUserId: string | null;
    closedByUserId: string | null;
    createdAt: Date;
    course: {
      id: string;
      slug: string;
      title: string;
      description: string | null;
      runtimeType: string;
      entryUrl: string;
      status: CourseStatus;
      coursewareLinks?: Array<{
        sortOrder: number;
        courseware: {
          id: string;
          slug: string;
          title: string;
          description: string | null;
          sortOrder: number;
          runtimeType: string;
          entryUrl: string;
          status: CourseStatus;
        };
      }>;
    };
    class: {
      id: string;
      name: string;
      code: string | null;
      organization: {
        id: string;
        name: string;
      };
    };
    teacher: {
      id: string;
      email: string;
      displayName: string | null;
    };
    _count?: {
      learningRecords: number;
    };
  }) {
    const { coursewareLinks, ...course } = assignment.course;
    const coursewares = (coursewareLinks ?? []).map((link) => ({
      ...link.courseware,
      sortOrder: link.sortOrder,
    }));

    return {
      id: assignment.id,
      title: assignment.title,
      instructions: assignment.instructions,
      startAt: assignment.startAt,
      dueAt: assignment.dueAt,
      status: assignment.status,
      teachingStatus: assignment.teachingStatus,
      openedAt: assignment.openedAt,
      closedAt: assignment.closedAt,
      openedByUserId: assignment.openedByUserId,
      closedByUserId: assignment.closedByUserId,
      createdAt: assignment.createdAt,
      recordsCount: assignment._count?.learningRecords ?? 0,
      course: {
        ...course,
        coursewares,
      },
      class: assignment.class,
      teacher: assignment.teacher,
    };
  }

  private async ensureCourse(id: string) {
    const course = await this.prisma.course.findFirst({
      where: { id, deletedAt: null },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return course;
  }

  private includeCoursewareRelations() {
    return {
      course: true,
      _count: {
        select: {
          learningRecords: true,
          launchSessions: true,
        },
      },
    } satisfies Prisma.CoursewareInclude;
  }

  private async ensureCourseware(id: string): Promise<CoursewareWithCourse> {
    const courseware = await this.prisma.courseware.findFirst({
      where: { id, deletedAt: null, course: { deletedAt: null } },
      include: { course: true },
    });
    if (!courseware) {
      throw new NotFoundException('Courseware not found');
    }
    return this.withCoursewarePublicUrl(courseware);
  }

  private async findCoursewareById(id: string) {
    const courseware = await this.prisma.courseware.findFirst({
      where: { id, deletedAt: null, course: { deletedAt: null } },
      include: this.includeCoursewareRelations(),
    });
    if (!courseware) {
      throw new NotFoundException('Courseware not found');
    }
    return courseware;
  }

  private async ensureSlugAvailable(slug: string) {
    const existed = await this.prisma.course.findUnique({ where: { slug } });
    if (existed) {
      throw new BadRequestException(
        existed.deletedAt
          ? '课程访问短名已在回收站，请先恢复或永久删除后再创建'
          : '课程访问短名已存在',
      );
    }
  }

  private async ensureCoursewareSlugAvailable(
    courseId: string,
    slug: string,
    ignoredId?: string,
  ) {
    const existed = await this.prisma.courseware.findFirst({
      where: { courseId, slug },
    });
    if (existed && existed.id !== ignoredId) {
      throw new BadRequestException(
        existed.deletedAt
          ? '课件访问短名已在回收站，请先恢复或永久删除后再创建'
          : '该课程下已存在同名课件访问短名',
      );
    }
  }

  private async generateAvailableCourseSlug(title: string) {
    const base = this.slugBaseFromText(title, 'course');
    return this.generateAvailableSlug(base, async (slug) => {
      const existed = await this.prisma.course.findUnique({
        where: { slug },
        select: { id: true },
      });
      return !existed;
    });
  }

  private async generateAvailableCoursewareSlug(courseId: string, title: string) {
    const base = this.slugBaseFromText(title, 'courseware');
    return this.generateAvailableSlug(base, async (slug) => {
      const existed = await this.prisma.courseware.findFirst({
        where: { courseId, slug },
        select: { id: true },
      });
      return !existed;
    });
  }

  private async generateAvailableSlug(
    base: string,
    isAvailable: (slug: string) => Promise<boolean>,
  ) {
    let candidate = base.slice(0, 80);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await isAvailable(candidate)) {
        return candidate;
      }

      const suffix = attempt === 0 ? this.shortToken() : `${this.shortToken()}-${attempt + 1}`;
      candidate = `${base.slice(0, Math.max(3, 79 - suffix.length))}-${suffix}`;
    }

    throw new BadRequestException('系统生成访问短名失败，请手动填写一个访问短名');
  }

  private slugBaseFromText(text: string, fallback: string) {
    const base = text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 64);

    return base.length >= 3 ? base : fallback;
  }

  private shortToken() {
    return `${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 5)}`;
  }

  private async nextCoursewareSortOrder(courseId: string) {
    const last = await this.prisma.courseware.findFirst({
      where: { courseId, deletedAt: null },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    return (last?.sortOrder ?? 0) + 10;
  }

  private normalizeSlug(slug: string) {
    return slug.trim().toLowerCase();
  }

  private needsNodeRuntime(runtimeType: CourseRuntimeType) {
    return runtimeType === CourseRuntimeType.NODE || runtimeType === CourseRuntimeType.BOTH;
  }

  private async resolveNodePort(
    runtimeType: CourseRuntimeType,
    requested?: number | null,
    existing?: number | null,
  ) {
    if (!this.needsNodeRuntime(runtimeType)) {
      return null;
    }

    if (requested) {
      return requested;
    }

    if (existing) {
      return existing;
    }

    return this.allocateNodeRuntimePort();
  }

  private async allocateNodeRuntimePort() {
    const start = this.normalizedPortConfig('COURSE_RUNTIME_PORT_START', 4102);
    const end = this.normalizedPortConfig('COURSE_RUNTIME_PORT_END', 4999);

    for (let port = start; port <= end; port += 1) {
      const assigned = await this.isNodePortAssigned(port);
      if (assigned) {
        continue;
      }

      const runningPids = await this.findPidsByPort(port);
      if (runningPids.length === 0) {
        return port;
      }
    }

    throw new BadRequestException(`没有可用的 Node 课件端口，请扩展 ${start}-${end} 端口池`);
  }

  private normalizedPortConfig(key: string, fallback: number) {
    const value = Number(this.config.get<string>(key));
    return Number.isInteger(value) && value >= 1024 && value <= 65535 ? value : fallback;
  }

  private async isNodePortAssigned(nodePort: number) {
    const [course, courseware] = await Promise.all([
      this.prisma.course.findFirst({
        where: { nodePort, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.courseware.findFirst({
        where: { nodePort, deletedAt: null },
        select: { id: true },
      }),
    ]);

    return Boolean(course || courseware);
  }

  private async persistCourseNodePortIfNeeded(course: Course, nodePort: number) {
    if (course.nodePort === nodePort) {
      return;
    }

    const manifest = this.extractManifest(course.manifest);
    await this.prisma.course.update({
      where: { id: course.id },
      data: {
        nodePort,
        ...(manifest ? { manifest: { ...manifest, nodePort } as Prisma.InputJsonValue } : {}),
      },
    });
  }

  private async persistCoursewareNodePortIfNeeded(courseware: CoursewareWithCourse, nodePort: number) {
    if (courseware.nodePort === nodePort) {
      return;
    }

    const manifest = this.extractManifest(courseware.manifest);
    await this.prisma.courseware.update({
      where: { id: courseware.id },
      data: {
        nodePort,
        ...(manifest ? { manifest: { ...manifest, nodePort } as Prisma.InputJsonValue } : {}),
      },
    });
  }

  private courseRoot(courseSlug: string) {
    const configuredRoot = this.config.get<string>('COURSE_RUNTIME_ROOT');
    const runtimeRoot = configuredRoot?.trim() || path.join(process.cwd(), 'course-runtime');
    return path.resolve(runtimeRoot, courseSlug);
  }

  private coursewareRoot(courseware: CoursewareWithCourse) {
    return path.join(
      this.courseRoot(courseware.course.slug),
      'coursewares',
      courseware.slug,
    );
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

  private systemdServiceName(target: RuntimeTarget) {
    if (typeof target === 'string') {
      return `meiyu-course-${this.sanitizeSystemdNamePart(target)}.service`;
    }

    if (this.isCoursewareTarget(target)) {
      return [
        'meiyu-courseware',
        this.sanitizeSystemdNamePart(target.course.slug),
        this.sanitizeSystemdNamePart(target.slug),
        target.id.slice(0, 8),
      ].join('-').slice(0, 190).replace(/-+$/g, '').concat('.service');
    }

    return [
      'meiyu-course',
      this.sanitizeSystemdNamePart(target.slug),
      target.id.slice(0, 8),
    ].join('-').slice(0, 190).replace(/-+$/g, '').concat('.service');
  }

  private sanitizeSystemdNamePart(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'runtime';
  }

  private async resolveRuntimeHealth(target: RuntimeTarget, nodePort?: number | null): Promise<RuntimeHealth> {
    const serviceName = this.systemdServiceName(target);
    const systemdState = this.shouldUseSystemdRuntime()
      ? await this.readSystemdState(serviceName)
      : null;
    let pid = await this.readRuntimePid(target);
    let running = pid ? this.isPidRunning(pid) : false;

    if (nodePort) {
      const portPids = await this.findPidsByPort(nodePort);
      if (portPids.length > 0) {
        pid = portPids[0];
        running = true;
        await writeFile(this.runtimePidPath(target), `${pid}\n`);
      } else {
        running = false;
      }
    }

    return {
      pid,
      running,
      serviceName,
      systemdActive: systemdState ? systemdState.activeState === 'active' : null,
      systemdManaged: systemdState ? systemdState.loadState === 'loaded' : false,
    };
  }

  private async readSystemdState(serviceName: string) {
    const result = await this.runCommandOutput('systemctl', [
      'show',
      serviceName,
      '--property=LoadState',
      '--property=ActiveState',
      '--no-pager',
    ], { ignoreFailure: true });

    if (!result.ok) {
      return null;
    }

    const state = Object.fromEntries(
      result.stdout
        .trim()
        .split(/\n+/)
        .map((line) => line.split('='))
        .filter((parts): parts is [string, string] => parts.length === 2),
    );
    const loadState = state.LoadState;
    const activeState = state.ActiveState;
    if (!loadState || loadState === 'not-found') {
      return null;
    }

    return { loadState, activeState: activeState ?? 'unknown' };
  }

  private sanitizeUploadPath(rawPath: string, courseSlug: string, coursewareSlug?: string) {
    const cleaned = rawPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
    const parts = cleaned.split('/').filter(Boolean);

    if (parts[0] === courseSlug) {
      parts.shift();
    }

    if (coursewareSlug && parts[0] === 'coursewares') {
      parts.shift();
    }

    if (coursewareSlug && parts[0] === coursewareSlug) {
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

  private defaultCoursewareManifest(courseware: CoursewareWithCourse): CourseManifest {
    return {
      slug: courseware.slug,
      title: courseware.title,
      runtimeType: courseware.runtimeType,
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
      errors.push(`manifest.slug 必须等于课程访问短名：${course.slug}`);
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
      if (manifest.nodePort !== null && (manifest.nodePort < 1024 || manifest.nodePort > 65535)) {
        errors.push('manifest.nodePort 如填写，必须是 1024-65535 的端口；不填则由系统自动分配');
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

  private async validateCoursewareManifest(
    courseware: CoursewareWithCourse,
    coursewareRoot: string,
    generated: boolean,
  ): Promise<ManifestValidation> {
    const errors: string[] = [];
    let rawManifest: unknown;

    try {
      rawManifest = await this.readManifestFromDisk(coursewareRoot);
    } catch {
      rawManifest = this.defaultCoursewareManifest(courseware);
      errors.push('缺少 manifest.json，已按课件登记信息生成基础 manifest');
    }

    const manifest = this.coerceCoursewareManifest(rawManifest, courseware, errors);

    if (generated && manifest.runtimeType !== CourseRuntimeType.STATIC) {
      errors.push('Node 课件必须提供 manifest.json，不能只依赖系统自动生成');
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
        (await this.pathExists(path.join(coursewareRoot, 'static', 'index.html'))) ||
        (await this.pathExists(path.join(coursewareRoot, 'index.html')));
      if (!hasStaticEntry) {
        errors.push('静态课件需要 static/index.html 或根目录 index.html');
      }
    }

    if (
      manifest.runtimeType === CourseRuntimeType.NODE ||
      manifest.runtimeType === CourseRuntimeType.BOTH
    ) {
      if (manifest.nodePort !== null && (manifest.nodePort < 1024 || manifest.nodePort > 65535)) {
        errors.push('manifest.nodePort 如填写，必须是 1024-65535 的端口；不填则由系统自动分配');
      }

      if (!(await this.findNodeServerDir(coursewareRoot))) {
        errors.push('Node 课件需要 server/package.json 或根目录 package.json');
      }
    }

    return {
      manifest,
      valid: errors.length === 0,
      errors,
      generated,
      entryUrl: this.buildCoursewareEntryUrl(
        courseware.course.slug,
        courseware.slug,
        manifest.entry,
      ),
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

  private coerceCoursewareManifest(
    rawManifest: unknown,
    courseware: CoursewareWithCourse,
    errors: string[],
  ): CourseManifest {
    if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
      errors.push('manifest.json 必须是 JSON 对象');
      return this.defaultCoursewareManifest(courseware);
    }

    const raw = rawManifest as Record<string, unknown>;
    const runtimeType = this.isCourseRuntimeType(raw.runtimeType)
      ? raw.runtimeType
      : courseware.runtimeType;

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
      slug: courseware.slug,
      title: typeof raw.title === 'string' ? raw.title.trim() : courseware.title,
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

  private buildCourseContainerUrl(slug: string) {
    return `${this.agentPublicUrl()}/${slug}/`;
  }

  private buildCoursewareEntryUrl(courseSlug: string, coursewareSlug: string, entry: string) {
    const normalizedEntry = entry.startsWith('/') ? entry : `/${entry}`;
    return `${this.agentPublicUrl()}/${courseSlug}/${coursewareSlug}${normalizedEntry === '/' ? '/' : normalizedEntry}`;
  }

  private manifestEntry(rawManifest: Prisma.JsonValue | null) {
    if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
      return '/';
    }

    const raw = rawManifest as Record<string, unknown>;
    return typeof raw.entry === 'string' && raw.entry.trim().startsWith('/')
      ? raw.entry.trim()
      : '/';
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
    target: Course | CoursewareWithCourse,
    nodePort: number,
    extraEnv: Record<string, string> | undefined,
  ): NodeJS.ProcessEnv {
    const isCourseware = this.isCoursewareTarget(target);
    const courseSlug = isCourseware ? target.course.slug : target.slug;
    const coursewareSlug = isCourseware ? target.slug : undefined;
    const publicPath = coursewareSlug
      ? `/${courseSlug}/${coursewareSlug}`
      : `/${courseSlug}`;
    const storedEnv = this.readCourseRuntimeEnv(target);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...storedEnv,
      ...(extraEnv ?? {}),
      NODE_ENV: 'production',
      PORT: String(nodePort),
      HOST: '127.0.0.1',
      HOSTNAME: '127.0.0.1',
      COURSE_SLUG: courseSlug,
      ...(coursewareSlug ? { COURSEWARE_SLUG: coursewareSlug } : {}),
      NEXT_PUBLIC_COURSE_BASE_PATH: publicPath,
      PLATFORM_PUBLIC_URL: this.platformPublicUrl(),
      PLATFORM_API_BASE_URL: `${this.platformPublicUrl()}/api/v1`,
      COURSEWARE_PUBLIC_URL: `${this.agentPublicUrl()}${publicPath}`,
      NPM_CONFIG_CACHE: path.join(this.runtimeStateDir(target), 'npm-cache'),
    };

    if (!storedEnv.DATABASE_URL && !extraEnv?.DATABASE_URL) {
      delete env.DATABASE_URL;
    }

    return env;
  }

  private readCourseRuntimeEnv(target: RuntimeTarget): Record<string, string> {
    try {
      const raw = readFileSync(path.join(this.runtimeStateDir(target), 'env.json'), 'utf8');
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

  private async runElevatedCommand(
    command: string,
    args: string[],
    options: { ignoreFailure?: boolean; logFile?: string } = {},
  ) {
    const actualCommand = this.shouldUseSudoForSystemd() ? 'sudo' : command;
    const actualArgs = this.shouldUseSudoForSystemd() ? [command, ...args] : args;
    const result = await this.runCommandOutput(actualCommand, actualArgs, {
      ignoreFailure: options.ignoreFailure,
    });

    if (options.logFile && (result.stdout || result.stderr)) {
      await appendFile(
        options.logFile,
        [
          result.stdout,
          result.stderr,
        ].filter(Boolean).join('\n'),
      );
    }

    return result;
  }

  private async installSystemdService(
    serviceName: string,
    unitDraftPath: string,
    unitPath: string,
    logFile: string,
  ) {
    const helper = this.systemdHelperPath();
    if (helper) {
      await this.runElevatedCommand(helper, ['install', serviceName, unitDraftPath], { logFile });
      return;
    }

    await this.runElevatedCommand('install', ['-m', '0644', unitDraftPath, unitPath], { logFile });
    await this.runElevatedCommand('systemctl', ['daemon-reload'], { logFile });
    await this.runElevatedCommand('systemctl', ['enable', serviceName], { logFile });
    await this.runElevatedCommand('systemctl', ['restart', serviceName], { logFile });
  }

  private async stopSystemdService(serviceName: string) {
    const helper = this.systemdHelperPath();
    if (helper) {
      await this.runElevatedCommand(helper, ['stop', serviceName], { ignoreFailure: true });
      return;
    }

    await this.runElevatedCommand('systemctl', ['stop', serviceName], { ignoreFailure: true });
  }

  private async appendSystemdStatus(serviceName: string, logFile: string) {
    const helper = this.systemdHelperPath();
    if (helper) {
      await this.runElevatedCommand(helper, ['status', serviceName], {
        ignoreFailure: true,
        logFile,
      });
      return;
    }

    await this.runElevatedCommand('systemctl', ['status', serviceName, '--no-pager'], {
      ignoreFailure: true,
      logFile,
    });
  }

  private systemdHelperPath() {
    return this.config.get<string>('COURSE_RUNTIME_SYSTEMD_HELPER')?.trim() || '';
  }

  private async runCommandOutput(
    command: string,
    args: string[],
    options: { ignoreFailure?: boolean } = {},
  ) {
    return new Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const child = spawn(command, args, { shell: false });
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
          reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}: ${stderr || stdout}`));
          return;
        }

        resolve({ ok, stdout, stderr, code });
      });
    });
  }

  private async startNodeRuntime(
    target: Course | CoursewareWithCourse,
    serverDir: string,
    nodePort: number,
    env: NodeJS.ProcessEnv,
    logFile: string,
  ) {
    await this.stopNodeRuntime(target, nodePort);

    if (this.shouldUseSystemdRuntime()) {
      return this.startNodeRuntimeWithSystemd(target, serverDir, nodePort, env, logFile);
    }

    return this.startNodeRuntimeDetached(target, serverDir, nodePort, env, logFile);
  }

  private async startNodeRuntimeDetached(
    target: Course | CoursewareWithCourse,
    serverDir: string,
    nodePort: number,
    env: NodeJS.ProcessEnv,
    logFile: string,
  ) {
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

    await writeFile(this.runtimePidPath(target), `${child.pid}\n`);

    try {
      const runtimePid = await this.waitForRuntimePort(nodePort, () => exitState);
      await writeFile(this.runtimePidPath(target), `${runtimePid}\n`);
      return runtimePid;
    } catch (error) {
      await this.stopNodeRuntime(target, nodePort).catch(() => undefined);
      throw error;
    }
  }

  private async startNodeRuntimeWithSystemd(
    target: Course | CoursewareWithCourse,
    serverDir: string,
    nodePort: number,
    env: NodeJS.ProcessEnv,
    logFile: string,
  ) {
    const serviceName = this.systemdServiceName(target);
    if (!serviceName) {
      throw new Error('Node 课件 systemd 服务名生成失败');
    }

    const stateDir = this.runtimeStateDir(target);
    await mkdir(stateDir, { recursive: true });
    await mkdir(path.dirname(logFile), { recursive: true });

    const envFile = path.join(stateDir, 'systemd.env');
    const unitDraftPath = path.join(stateDir, `${serviceName}.service`);
    const unitPath = `/etc/systemd/system/${serviceName}`;
    const unitContent = this.systemdUnitContent({
      serviceName,
      serverDir,
      envFile,
      logFile,
    });

    await writeFile(envFile, this.systemdEnvContent(env));
    await writeFile(unitDraftPath, unitContent);
    await writeFile(this.runtimeServiceNamePath(target), `${serviceName}\n`);

    await appendFile(logFile, `\n[${new Date().toISOString()}] install systemd service ${serviceName}\n`);
    await this.installSystemdService(serviceName, unitDraftPath, unitPath, logFile);

    try {
      const runtimePid = await this.waitForRuntimePort(nodePort, () => null);
      await writeFile(this.runtimePidPath(target), `${runtimePid}\n`);
      return runtimePid;
    } catch (error) {
      await this.appendSystemdStatus(serviceName, logFile);
      throw error;
    }
  }

  private systemdUnitContent(input: {
    serviceName: string;
    serverDir: string;
    envFile: string;
    logFile: string;
  }) {
    const npmBin = this.config.get<string>('COURSE_RUNTIME_NPM_BIN', '/usr/bin/npm');
    return `[Unit]
Description=Meiyu Courseware Runtime ${input.serviceName}
After=network.target meiyu-api.service
Wants=network.target

[Service]
Type=simple
User=meiyu
Group=meiyu
WorkingDirectory=${input.serverDir}
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=${input.envFile}
ExecStart=${npmBin} run start
Restart=always
RestartSec=3
KillSignal=SIGINT
TimeoutStopSec=20
StandardOutput=append:${input.logFile}
StandardError=append:${input.logFile}
SyslogIdentifier=${input.serviceName.replace(/\.service$/, '')}

[Install]
WantedBy=multi-user.target
`;
  }

  private systemdEnvContent(env: NodeJS.ProcessEnv) {
    const allowedKeys = [
      'NODE_ENV',
      'PORT',
      'HOST',
      'HOSTNAME',
      'COURSE_SLUG',
      'COURSEWARE_SLUG',
      'NEXT_PUBLIC_COURSE_BASE_PATH',
      'PLATFORM_PUBLIC_URL',
      'PLATFORM_API_BASE_URL',
      'COURSEWARE_PUBLIC_URL',
      'NPM_CONFIG_CACHE',
      'DATABASE_URL',
    ];

    return allowedKeys
      .filter((key) => env[key] !== undefined)
      .map((key) => `${key}=${this.quoteSystemdEnvValue(String(env[key]))}`)
      .join('\n')
      .concat('\n');
  }

  private quoteSystemdEnvValue(value: string) {
    return `"${value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')}"`;
  }

  private async stopNodeRuntime(target: RuntimeTarget, nodePort?: number) {
    if (this.shouldUseSystemdRuntime()) {
      const serviceName = this.systemdServiceName(target);
      if (serviceName) {
        await this.stopSystemdService(serviceName);
      }
    }

    const pid = await this.readRuntimePid(target);
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
    const lsofPids = await this.findPidsByPortWithLsof(port);
    if (lsofPids.length > 0) {
      return lsofPids;
    }

    return this.findPidsByPortWithSs(port);
  }

  private async findPidsByPortWithLsof(port: number) {
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

  private async findPidsByPortWithSs(port: number) {
    return new Promise<number[]>((resolve) => {
      const child = spawn('ss', ['-ltnp', 'sport', '=', `:${port}`], { shell: false });
      let output = '';

      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });

      child.on('error', () => resolve([]));
      child.on('close', () => {
        const pids = [...output.matchAll(/pid=(\d+)/g)]
          .map((match) => Number(match[1]))
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
    while (Date.now() - startedAt < 60000) {
      const pids = await this.findPidsByPort(port);
      if (pids.length > 0) {
        return pids[0];
      }

      const exitState = getExitState();
      if (exitState) {
        throw new Error(
          `Node 课件启动失败：进程已退出，code=${exitState.code ?? 'null'}，signal=${exitState.signal ?? 'null'}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Node 课件启动超时：端口 ${port} 未监听`);
  }

  private runtimeStateDir(target: RuntimeTarget) {
    if (typeof target === 'string') {
      return path.join(this.courseRoot(target), '.runtime');
    }

    if (this.isCoursewareTarget(target)) {
      return path.join(this.coursewareRoot(target), '.runtime');
    }

    return path.join(this.courseRoot(target.slug), '.runtime');
  }

  private runtimePidPath(target: RuntimeTarget) {
    return path.join(this.runtimeStateDir(target), 'node.pid');
  }

  private runtimeServiceNamePath(target: RuntimeTarget) {
    return path.join(this.runtimeStateDir(target), 'systemd.service');
  }

  private runtimeLogPath(target: RuntimeTarget) {
    return path.join(this.runtimeStateDir(target), 'deploy.log');
  }

  private async readRuntimePid(target: RuntimeTarget) {
    try {
      const raw = await readFile(this.runtimePidPath(target), 'utf8');
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

  private async readRuntimeLogTail(target: RuntimeTarget) {
    try {
      const raw = await readFile(this.runtimeLogPath(target), 'utf8');
      return raw.slice(-4000);
    } catch {
      return '';
    }
  }

  private isCoursewareTarget(target: RuntimeTarget): target is CoursewareWithCourse {
    return typeof target !== 'string' && 'course' in target;
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
