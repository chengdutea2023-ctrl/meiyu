import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CourseOwnerType, CourseRuntimeType, CourseStatus } from '@prisma/client';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UploadCourseFilesDto } from './dto/upload-course-files.dto';

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
    const writtenFiles: Array<{ path: string; bytes: number }> = [];

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
      const manifestPath = path.join(courseRoot, 'manifest.json');
      const manifest = {
        slug: course.slug,
        title: course.title,
        runtimeType: course.runtimeType,
        entry: '/',
        nodePort: null,
      };
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      manifestGenerated = true;
      writtenFiles.push({ path: 'manifest.json', bytes: Buffer.byteLength(JSON.stringify(manifest)) });
    }

    const updatedCourse = dto.publish
      ? await this.updateStatus(course.id, CourseStatus.PUBLISHED)
      : await this.findById(course.id);

    return {
      course: updatedCourse,
      courseRoot,
      files: writtenFiles,
      manifestGenerated,
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
    return Number(this.config.get<string>('COURSE_UPLOAD_MAX_BYTES', String(50 * 1024 * 1024)));
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

    if (parts.some((part) => part === '..' || part === '.' || part === 'node_modules')) {
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
}
