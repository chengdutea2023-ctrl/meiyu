// Platform-only acceptance helper. Credentials are read privately, never printed or packaged.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const [phase, base, accountsFile, receiptFile, archive] = process.argv.slice(2);
assert.ok(['setup', 'verify', 'close'].includes(phase), 'Expected setup, verify or close');
assert.ok(base && accountsFile && receiptFile, 'Expected API base, private accounts and receipt path');
const accounts = JSON.parse(await readFile(accountsFile, 'utf8'));
const sessions = {};
async function request(route, method = 'GET', body, role = 'ADMIN', expected = [200, 201]) {
  const response = await fetch(base + route, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(sessions[role] ? { Authorization: `Bearer ${sessions[role]}` } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90000),
  });
  const data = await response.json().catch(() => ({}));
  assert.ok(expected.includes(response.status), `${method} ${route}: HTTP ${response.status}`);
  return data;
}
for (const role of ['ADMIN', 'TEACHER', 'STUDENT']) {
  const account = accounts.accounts.find(item => item.userType === role);
  assert.ok(account?.username && account?.password, `Missing private ${role} test account`);
  sessions[role] = (await request('/auth/login', 'POST', {
    usernameOrEmail: account.username, password: account.password,
  }, '', [200, 201])).accessToken;
  assert.ok(sessions[role], `Login failed for ${role}`);
}
const list = (data, key) => Array.isArray(data) ? data : data[key];
let receipt;
if (phase === 'setup') {
  assert.ok(archive && accounts.classId, 'ZIP and isolated class are required');
  const courses = list(await request('/courses'), 'courses');
  const matching = courses.filter(item => item.slug === 'qiong-ai-inquiry' || item.title === '邛窑AI探究');
  assert.ok(matching.length <= 1, 'Ambiguous existing Qiong course');
  const course = matching[0] || await request('/courses', 'POST', {
    slug: 'qiong-ai-inquiry', title: '邛窑AI探究',
    description: '在邛窑教学情境中探索AI。各课件独立使用，不要求固定顺序。',
  });
  assert.equal(course.title, '邛窑AI探究');
  assert.equal(course.slug, 'qiong-ai-inquiry', 'Existing course metadata needs reconciliation');
  const wares = list(await request(`/courses/${course.id}/coursewares`), 'coursewares');
  let ware = wares.find(item => item.slug === 'qiong-ai-vision-challenge');
  if (!ware) ware = await request(`/courses/${course.id}/coursewares`, 'POST', {
    slug: 'qiong-ai-vision-challenge', title: '邛窑AI眼力挑战', runtimeType: 'STATIC',
    description: '碗罐壶真实图片分类，识别原图与单变量变化两次即可形成对照，支持继续探究图像线索。',
  });
  assert.equal(ware.title, '邛窑AI眼力挑战');
  await request(`/coursewares/${ware.id}/zip`, 'POST', {
    fileName: path.basename(archive), contentBase64: (await readFile(archive)).toString('base64'), publish: true,
  });
  await request(`/courses/${course.id}/status`, 'PATCH', { status: 'PUBLISHED' });
  const teacher = await request('/portal/me', 'GET', undefined, 'TEACHER');
  const teacherId = teacher.id || teacher.user?.id;
  assert.ok(teacherId, 'Teacher context ID missing');
  const assignments = list(await request('/course-assignments'), 'assignments');
  const title = '邛窑课件二 · 隔离发布验收';
  const previous = assignments.filter(item => (item.courseId || item.course?.id) === course.id && item.title === title && (item.classId || item.class?.id) === accounts.classId && item.teachingStatus !== 'ENDED');
  assert.ok(previous.length <= 1, 'Ambiguous existing test assignment');
  const assignment = previous[0] || await request('/course-assignments', 'POST', {
    courseId: course.id, classId: accounts.classId, teacherId, title,
    instructions: '仅供隔离测试账号验收，不是真实课堂任务。', startAt: new Date().toISOString(),
  });
  await request(`/portal/teacher/assignments/${assignment.id}/open`, 'PATCH', {}, 'TEACHER');
  await request(`/portal/teacher/assignments/${assignment.id}/coursewares/${ware.id}/open`, 'PATCH', {}, 'TEACHER');
  const studentTasks = await request('/portal/student/assignments', 'GET', undefined, 'STUDENT');
  assert.ok(JSON.stringify(studentTasks).includes(assignment.id), 'Student cannot see isolated task');
  receipt = { courseId: course.id, courseSlug: course.slug, coursewareId: ware.id,
    assignmentId: assignment.id, classId: accounts.classId, createdAt: new Date().toISOString() };
  await mkdir(path.dirname(receiptFile), { recursive: true, mode: 0o700 });
  await writeFile(receiptFile, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ phase, course: course.title, courseware: ware.title, isolatedTaskVisible: true }));
} else {
  receipt = JSON.parse(await readFile(receiptFile, 'utf8'));
  if (phase === 'verify') {
    const teacher = await request(`/portal/teacher/learning-records?assignmentId=${receipt.assignmentId}&coursewareId=${receipt.coursewareId}`, 'GET', undefined, 'TEACHER');
    const records = list(teacher, 'records');
    const record = records.find(item => item.status === 'COMPLETED');
    assert.ok(record, 'No completed browser submission found');
    assert.equal(record.score, 100);
    assert.equal(record.summary.displayTitle, '邛窑AI眼力实验卡');
    assert.ok(record.summary.resultItems.length >= 5);
    assert.equal(record.summary.artifacts.length, 3);
    assert.ok(Number.isInteger(record.durationSeconds) && record.durationSeconds >= 0);
    const student = list(await request('/portal/student/learning-records', 'GET', undefined, 'STUDENT'), 'records');
    assert.ok(student.some(item => item.id === record.id && item.score === 100), 'Student cannot read completed result');
    const detail = await request(`/portal/student/learning-records/${record.id}`, 'GET', undefined, 'STUDENT');
    assert.ok(JSON.stringify(detail).includes('邛窑眼力实验记录.txt'));
    for (const artifact of record.summary.artifacts) {
      const response = await fetch(new URL(artifact.url, base), { signal: AbortSignal.timeout(20000) });
      assert.equal(response.status, 200, 'Artifact download failed');
      const buffer = await response.arrayBuffer();
      assert.ok(buffer.byteLength > 50);
      if (artifact.mimeType === 'application/json') {
        const data = JSON.parse(new TextDecoder().decode(buffer));
        assert.equal(data.modelVersion, 'qiong-vision-1.0.0');
        assert.ok(data.records.length >= 2);
        assert.ok(data.records.every(item => item.values.length === 3 && item.values.every(Number.isFinite)));
        assert.ok(!JSON.stringify(data).includes('launchToken'));
      }
    }
    receipt.recordId = record.id;
    receipt.verifiedAt = new Date().toISOString();
    await writeFile(receiptFile, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ phase, score: record.score, completed: true, teacherRead: true, studentRead: true,
      artifactsDownloaded: 3, realPixelExperiments: true }));
  } else {
    await request(`/portal/teacher/assignments/${receipt.assignmentId}/coursewares/${receipt.coursewareId}/close`, 'PATCH', {}, 'TEACHER');
    await request(`/portal/teacher/assignments/${receipt.assignmentId}/close`, 'PATCH', {}, 'TEACHER');
    await request('/course-runtime/launch', 'POST', { courseSlug: receipt.courseSlug, coursewareSlug: 'qiong-ai-vision-challenge', assignmentId: receipt.assignmentId, classId: receipt.classId }, 'STUDENT', [403]);
    receipt.closedAt = new Date().toISOString();
    await writeFile(receiptFile, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ phase, isolatedTaskClosed: true, realClassesChanged: false }));
  }
}
