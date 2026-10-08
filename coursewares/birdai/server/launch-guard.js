import { createHash } from 'node:crypto';

export function createLaunchGuard(env = process.env) {
  return async (request, response, next) => {
    const token = String(request.headers['x-course-launch'] || '').trim();
    if (!token || token.length > 512) return response.status(401).json({ detail: '请从学生后台重新进入课件。' });
    const base = String(env.PLATFORM_API_BASE_URL || '').replace(/\/$/, '');
    if (!base) return response.status(503).json({ detail: '课件平台校验地址尚未配置。' });
    try {
      const endpoint = new URL(base);
      if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Invalid platform configuration');
      const verified = await fetch(`${base}/course-runtime/launch/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ launchToken: token }), signal: AbortSignal.timeout(10000), redirect: 'error',
      });
      if (!verified.ok) return response.status(verified.status === 401 ? 401 : 403).json({ detail: '启动凭证无效、已过期，或课件暂未开放。' });
      const { context } = await verified.json();
      if (!context?.student?.id || context.readOnlyPreview || context.student.readOnlyPreview ||
          (env.COURSEWARE_SLUG && context.courseware?.slug !== env.COURSEWARE_SLUG) ||
          (env.COURSE_SLUG && context.course?.slug !== env.COURSE_SLUG)) {
        return response.status(403).json({ detail: '当前学习任务无权使用此识别服务。' });
      }
      request.learnerKey = createHash('sha256').update(token).digest('hex');
      next();
    } catch {
      response.status(503).json({ detail: '暂时无法校验学习权限，请稍后重试。' });
    }
  };
}
