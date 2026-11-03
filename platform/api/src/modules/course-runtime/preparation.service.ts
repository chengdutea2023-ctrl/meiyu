import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type Grant = { actorId: string; assignmentId: string; coursewareId: string; expires: number };
type PendingReview = {
  id: string; assignmentId: string; assignmentTitle: string; coursewareId: string;
  coursewareTitle: string; studentId: string; studentName: string; className: string;
  assetCount: number; submittedAt: string;
};

@Injectable()
export class PreparationService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private signature(value: string) {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) throw new UnauthorizedException('资料准备入口暂不可用');
    return createHmac('sha256', secret).update(`courseware-preparation-v1:${value}`).digest('base64url');
  }

  private token(actorId: string, assignmentId: string, coursewareId: string, lifetime = 8 * 60 * 60 * 1000) {
    const payload = Buffer.from(JSON.stringify({ actorId, assignmentId, coursewareId, expires: Date.now() + lifetime } satisfies Grant)).toString('base64url');
    return `prep1.${payload}.${this.signature(payload)}`;
  }

  async pendingReviews(actorId: string) {
    const teacher = await this.prisma.user.findFirst({
      where: { id: actorId, userType: 'TEACHER', status: 'ACTIVE', approvalStatus: 'APPROVED', deletedAt: null },
      select: { id: true },
    });
    if (!teacher) throw new ForbiddenException('仅任课教师可查看待审核线索');
    const assignments = await this.prisma.courseAssignment.findMany({
      where: { teacherId: actorId, status: 'ACTIVE', course: { status: 'PUBLISHED', deletedAt: null }, class: { status: 'ACTIVE', deletedAt: null, organization: { status: 'ACTIVE', deletedAt: null } } },
      include: {
        class: { include: { members: { where: { role: 'STUDENT', user: { status: 'ACTIVE', approvalStatus: 'APPROVED', deletedAt: null } }, select: { user: { select: { id: true, displayName: true } } } } } },
        course: { include: { coursewareLinks: { where: { courseware: { status: 'PUBLISHED', deletedAt: null, runtimeType: { not: 'STATIC' }, nodePort: { not: null } } }, include: { courseware: true } } } },
      },
    });
    const items: PendingReview[] = [];
    let unavailableCount = 0;
    const capabilities = new Map<number, Promise<boolean | null>>();
    const jobs = assignments.flatMap(assignment => assignment.course.coursewareLinks.map(({ courseware }) => ({ assignment, courseware })));
    // Bound local runtime requests; the browser never receives service ports or review credentials.
    const workers = Array.from({ length: Math.min(4, jobs.length) }, async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) {
        const { assignment, courseware } = job;
        const port = courseware.nodePort!;
        if (!Number.isInteger(port) || port < 1024 || port > 65535) continue;
        if (!capabilities.has(port)) capabilities.set(port, this.capability(port, courseware.runtimeType, true).catch(() => null));
        const available = await capabilities.get(port);
        if (available === null) { unavailableCount += 1; continue; }
        if (!available) continue;
        try {
          const response = await fetch(`http://127.0.0.1:${port}/api/preparation`, {
            headers: { 'x-preparation-token': this.token(actorId, assignment.id, courseware.id, 60_000) },
            signal: AbortSignal.timeout(8000), redirect: 'error',
          });
          if (!response.ok) {
            const failure = response.status === 403 ? await response.json().catch(() => null) : null;
            // Some historical course links reuse a runtime bound to its source course.
            if (failure?.code === 'COURSE_MISMATCH') continue;
            throw new Error('Preparation unavailable');
          }
          const data = await response.json();
          if (!Array.isArray(data.students)) throw new Error('Invalid preparation roster');
          const members = new Map(assignment.class.members.map(({ user }) => [user.id, user]));
          const seen = new Set<string>();
          for (const row of data.students) {
            const student = members.get(row?.id);
            if (!student || seen.has(student.id) || row.preparation?.status !== 'SUBMITTED') continue;
            const timestamp = new Date(row.preparation.submittedAt).getTime();
            if (!Number.isFinite(timestamp)) throw new Error('Invalid preparation submission time');
            seen.add(student.id);
            items.push({
              id: `preparation:${assignment.id}:${courseware.id}:${student.id}`,
              assignmentId: assignment.id, assignmentTitle: assignment.title,
              coursewareId: courseware.id, coursewareTitle: courseware.title,
              studentId: student.id, studentName: student.displayName || '学生',
              className: assignment.class.name,
              assetCount: Number.isInteger(row.assetCount) && row.assetCount >= 0 ? row.assetCount : 0,
              submittedAt: new Date(timestamp).toISOString(),
            });
          }
        } catch { unavailableCount += 1; }
      }
    });
    await Promise.all(workers);
    return { items: items.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)), unavailableCount };
  }

  private async assignment(actorId: string, assignmentId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: actorId, status: 'ACTIVE', approvalStatus: 'APPROVED', deletedAt: null }, select: { id: true, userType: true, displayName: true } });
    if (!user || !['TEACHER', 'STUDENT'].includes(user.userType)) throw new ForbiddenException('仅本任务教师或学生可进入');
    const assignment = await this.prisma.courseAssignment.findFirst({ where: { id: assignmentId, status: 'ACTIVE', course: { status: 'PUBLISHED', deletedAt: null }, class: { status: 'ACTIVE', deletedAt: null, organization: { status: 'ACTIVE', deletedAt: null } } }, include: { course: true, class: true } });
    if (!assignment) throw new NotFoundException('课程任务不存在或已归档');
    if (user.userType === 'TEACHER') {
      if (assignment.teacherId !== actorId) throw new ForbiddenException('只能查看自己负责的准备任务');
    } else {
      const member = await this.prisma.userClass.findUnique({ where: { userId_classId: { userId: actorId, classId: assignment.classId } } });
      if (!member || member.role !== 'STUDENT') throw new ForbiddenException('学生不属于本任务班级');
    }
    return { user, assignment };
  }

  private async capability(nodePort: number | null, runtimeType: string, strict = false) {
    if (runtimeType === 'STATIC' || !nodePort || !Number.isInteger(nodePort) || nodePort < 1024 || nodePort > 65535) return false;
    try {
      const r = await fetch(`http://127.0.0.1:${nodePort}/api/preparation/capability`, { signal: AbortSignal.timeout(1800), redirect: 'error' });
      if (strict && !r.ok && ![404, 405].includes(r.status)) throw new Error('Preparation capability unavailable');
      // Legacy coursewares may return their HTML shell for an unknown API path.
      if (r.headers?.get('content-type')?.includes('text/html')) return false;
      return r.ok && (await r.json()).preparation === true;
    } catch (error) { if (strict) throw error; return false; }
  }

  async options(actorId: string, assignmentId: string) {
    if (!assignmentId) throw new BadRequestException('请选择课程任务');
    const { assignment } = await this.assignment(actorId, assignmentId);
    const links = await this.prisma.courseCourseware.findMany({ where: { courseId: assignment.courseId, courseware: { status: 'PUBLISHED', deletedAt: null } }, include: { courseware: true } });
    const rows = await Promise.all(links.map(async ({ courseware: c }) => ({ coursewareId: c.id, available: await this.capability(c.nodePort, c.runtimeType) })));
    return { coursewares: rows.filter(c => c.available) };
  }

  async launch(actorId: string, assignmentId: string, coursewareId: string) {
    if (!assignmentId || !coursewareId) throw new BadRequestException('请选择本次准备任务和课件');
    const { assignment, user } = await this.assignment(actorId, assignmentId);
    const link = await this.prisma.courseCourseware.findUnique({ where: { courseId_coursewareId: { courseId: assignment.courseId, coursewareId } }, include: { courseware: true } });
    if (!link || link.courseware.deletedAt || link.courseware.status !== 'PUBLISHED' || !await this.capability(link.courseware.nodePort, link.courseware.runtimeType)) throw new BadRequestException('本课件尚未开放资料准备入口');
    const preparationToken = this.token(actorId, assignmentId, coursewareId);
    const platform = this.config.get<string>('PLATFORM_PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, '');
    const agent = this.config.get<string>('AGENT_PUBLIC_URL') || (new URL(platform).hostname.endsWith('docpine.online') ? 'https://agent.docpine.online' : platform);
    const url = new URL(`${agent.replace(/\/$/, '')}/${assignment.course.slug}/${link.courseware.slug}/`);
    const configuredReturn = this.config.get<string>(user.userType === 'TEACHER' ? 'TEACHER_PORTAL_PUBLIC_URL' : 'STUDENT_PORTAL_PUBLIC_URL') || this.config.get<string>(user.userType === 'TEACHER' ? 'TEACHER_PUBLIC_URL' : 'STUDENT_PUBLIC_URL');
    const returnUrl = configuredReturn || (new URL(platform).hostname.endsWith('docpine.online') ? `https://${user.userType === 'TEACHER' ? 'teacher' : 'student'}.docpine.online/` : `http://localhost:5173/?portal=${user.userType.toLowerCase()}`);
    url.searchParams.set('prepare', '1'); url.searchParams.set('preparationToken', preparationToken); url.searchParams.set('returnUrl', returnUrl);
    return { launchUrl: url.href, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() };
  }

  async verify(token: string) {
    if (typeof token !== 'string' || token.length > 4000) throw new UnauthorizedException('资料准备凭证无效');
    const [prefix, payload, signature, extra] = token.split('.');
    if (prefix !== 'prep1' || !payload || !signature || extra) throw new UnauthorizedException('资料准备凭证无效');
    const expected = Buffer.from(this.signature(payload)), received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new UnauthorizedException('资料准备凭证无效');
    let grant: Grant;
    try { grant = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw new UnauthorizedException('资料准备凭证无效'); }
    if (!grant.actorId || !grant.assignmentId || !grant.coursewareId || !Number.isFinite(grant.expires) || grant.expires <= Date.now()) throw new UnauthorizedException('资料准备凭证已过期，请返回工作台重新进入');
    const { user, assignment } = await this.assignment(grant.actorId, grant.assignmentId);
    const link = await this.prisma.courseCourseware.findUnique({ where: { courseId_coursewareId: { courseId: assignment.courseId, coursewareId: grant.coursewareId } }, include: { courseware: true } });
    if (!link || link.courseware.status !== 'PUBLISHED' || link.courseware.deletedAt) throw new ForbiddenException('本课件不属于当前任务');
    const students = user.userType === 'TEACHER' ? await this.prisma.userClass.findMany({ where: { classId: assignment.classId, role: 'STUDENT', user: { status: 'ACTIVE', approvalStatus: 'APPROVED', deletedAt: null } }, select: { user: { select: { id: true, displayName: true } } } }) : [];
    return { context: { role: user.userType, actor: { id: user.id, name: user.displayName }, student: user.userType === 'STUDENT' ? { id: user.id, name: user.displayName } : null, students: students.map(x => ({ id: x.user.id, name: x.user.displayName || '学生' })), assignment: { id: assignment.id, title: assignment.title, teachingStatus: assignment.teachingStatus }, course: { id: assignment.course.id, slug: assignment.course.slug, title: assignment.course.title }, courseware: { id: link.courseware.id, slug: link.courseware.slug, title: link.courseware.title }, class: { id: assignment.classId, name: assignment.class.name } } };
  }
}
