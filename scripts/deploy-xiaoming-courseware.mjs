import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const apiDir = path.join(repoRoot, 'platform', 'api');
const zipPath = path.join(repoRoot, '课件', 'xiaoming-huijia-current.zip');
const courseSlug = 'can-machines-learn';
const coursewareSlug = 'xiaoming-huijia';
const targetRoot = path.join(apiDir, 'course-runtime', courseSlug, 'coursewares', coursewareSlug);
const backupRoot = path.join(apiDir, 'course-runtime', '.codex-backups');

const requireFromApi = createRequire(path.join(apiDir, 'package.json'));
const dotenv = requireFromApi('dotenv');
const localEnvPath = path.join(apiDir, '.env');
if (await pathExists(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const publicBaseUrl = (process.env.AGENT_PUBLIC_URL || 'http://agent.docpine.online').replace(/\/$/, '');
const AdmZip = requireFromApi('adm-zip');
const {
  CourseRuntimeType,
  CourseStatus,
  CourseAssignmentStatus,
  CourseTeachingStatus,
  CoursewareTeachingStatus,
  PrismaClient,
} = requireFromApi('@prisma/client');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function shouldIgnoreZipEntry(name) {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return true;
  const parts = normalized.split('/');
  return parts.some((part) => {
    const lower = part.toLowerCase();
    return (
      lower === '__macosx' ||
      lower === '.ds_store' ||
      lower === '.git' ||
      lower === '.env' ||
      lower === 'node_modules'
    );
  });
}

function sanitizeEntryName(name) {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((part) => part === '..')) {
    throw new Error(`Unsafe zip path: ${name}`);
  }
  return parts.join('/');
}

function coursewareEntryUrl() {
  return `${publicBaseUrl}/${courseSlug}/${coursewareSlug}/`;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function extractZip() {
  if (!(await pathExists(zipPath))) {
    throw new Error(`Missing courseware ZIP: ${zipPath}`);
  }

  const zipBuffer = await fs.readFile(zipPath);
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw new Error('ZIP is empty');
  }

  await fs.mkdir(backupRoot, { recursive: true });
  if (await pathExists(targetRoot)) {
    const backupPath = path.join(backupRoot, `${coursewareSlug}-${timestamp()}`);
    await fs.cp(targetRoot, backupPath, { recursive: true });
    console.log(`backup=${backupPath}`);
  }

  await fs.rm(targetRoot, { recursive: true, force: true });
  await fs.mkdir(targetRoot, { recursive: true });

  let totalBytes = 0;
  let fileCount = 0;
  let manifestFromZip = null;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (shouldIgnoreZipEntry(entry.entryName)) continue;
    const relativePath = sanitizeEntryName(entry.entryName);
    if (!relativePath) continue;

    const targetPath = path.join(targetRoot, relativePath);
    const resolvedTarget = path.resolve(targetPath);
    const resolvedRoot = path.resolve(targetRoot);
    if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`) && resolvedTarget !== resolvedRoot) {
      throw new Error(`Unsafe target path: ${entry.entryName}`);
    }

    const content = entry.getData();
    totalBytes += content.byteLength;
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content);
    fileCount += 1;

    if (relativePath === 'manifest.json') {
      manifestFromZip = JSON.parse(content.toString('utf8'));
    }
  }

  if (fileCount === 0) {
    throw new Error('No files were extracted');
  }
  if (!(await pathExists(path.join(targetRoot, 'static', 'index.html')))) {
    throw new Error('Missing static/index.html after extraction');
  }

  return { fileCount, manifestFromZip, totalBytes };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const course = await prisma.course.findFirst({
      where: { slug: courseSlug, deletedAt: null },
    });
    if (!course) {
      throw new Error(`Course not found: ${courseSlug}`);
    }

    const { fileCount, manifestFromZip, totalBytes } = await extractZip();
    const title =
      manifestFromZip && typeof manifestFromZip.title === 'string' && manifestFromZip.title.trim()
        ? manifestFromZip.title.trim()
        : '小明回家';
    const manifest = {
      ...(manifestFromZip && typeof manifestFromZip === 'object' ? manifestFromZip : {}),
      slug: coursewareSlug,
      title,
      runtimeType: 'STATIC',
      entry: '/',
      nodePort: null,
    };

    const existingMax = await prisma.courseCourseware.aggregate({
      where: { courseId: course.id },
      _max: { sortOrder: true },
    });
    const sortOrder = Math.max(50, (existingMax._max.sortOrder ?? 0) + 10);

    const courseware = await prisma.courseware.upsert({
      where: {
        courseId_slug: {
          courseId: course.id,
          slug: coursewareSlug,
        },
      },
      update: {
        title,
        description: '格子城市地图算法课件：步行、公交、地铁一起规划小明回家的最优路线。',
        runtimeType: CourseRuntimeType.STATIC,
        entryUrl: coursewareEntryUrl(),
        status: CourseStatus.PUBLISHED,
        sortOrder,
        manifest,
        manifestValid: true,
        manifestErrors: [],
        deploymentStatus: 'STATIC_PUBLISHED',
        deploymentMessage: '静态课件已部署到业务底座。',
        nodePort: null,
        uploadedAt: new Date(),
        deletedAt: null,
      },
      create: {
        courseId: course.id,
        slug: coursewareSlug,
        title,
        description: '格子城市地图算法课件：步行、公交、地铁一起规划小明回家的最优路线。',
        runtimeType: CourseRuntimeType.STATIC,
        entryUrl: coursewareEntryUrl(),
        status: CourseStatus.PUBLISHED,
        sortOrder,
        manifest,
        manifestValid: true,
        manifestErrors: [],
        deploymentStatus: 'STATIC_PUBLISHED',
        deploymentMessage: '静态课件已部署到业务底座。',
        nodePort: null,
        uploadedAt: new Date(),
      },
    });

    await prisma.courseCourseware.upsert({
      where: {
        courseId_coursewareId: {
          courseId: course.id,
          coursewareId: courseware.id,
        },
      },
      update: { sortOrder },
      create: {
        courseId: course.id,
        coursewareId: courseware.id,
        sortOrder,
      },
    });

    const assignments = await prisma.courseAssignment.findMany({
      where: {
        courseId: course.id,
        status: CourseAssignmentStatus.ACTIVE,
      },
      select: {
        id: true,
        teacherId: true,
        teachingStatus: true,
      },
    });

    let openedStates = 0;
    for (const assignment of assignments) {
      const shouldOpen = assignment.teachingStatus !== CourseTeachingStatus.ENDED;
      await prisma.courseAssignmentCoursewareState.upsert({
        where: {
          assignmentId_coursewareId: {
            assignmentId: assignment.id,
            coursewareId: courseware.id,
          },
        },
        update: {
          status: shouldOpen ? CoursewareTeachingStatus.OPEN : CoursewareTeachingStatus.CLOSED,
          openedAt: shouldOpen ? new Date() : null,
          closedAt: shouldOpen ? null : new Date(),
          openedByUserId: shouldOpen ? assignment.teacherId : null,
          closedByUserId: shouldOpen ? null : assignment.teacherId,
        },
        create: {
          assignmentId: assignment.id,
          coursewareId: courseware.id,
          status: shouldOpen ? CoursewareTeachingStatus.OPEN : CoursewareTeachingStatus.CLOSED,
          openedAt: shouldOpen ? new Date() : null,
          closedAt: shouldOpen ? null : new Date(),
          openedByUserId: shouldOpen ? assignment.teacherId : null,
          closedByUserId: shouldOpen ? null : assignment.teacherId,
        },
      });
      if (shouldOpen) openedStates += 1;
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          courseId: course.id,
          courseSlug,
          coursewareId: courseware.id,
          coursewareSlug: courseware.slug,
          title: courseware.title,
          entryUrl: coursewareEntryUrl(),
          targetRoot,
          fileCount,
          totalBytes,
          assignmentStates: assignments.length,
          openedStates,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
