import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import module from '../platform/api/dist/modules/course-runtime/preparation.service.js';
import { readFile } from 'node:fs/promises';
const {PreparationService}=module;
function inboxFixture() {
  let approved = false;
  const students = [{ id: 'student', displayName: '测试学生' }, { id: 'other', displayName: '另一学生' }];
  const ware = { id: 'ware', nodePort: 4107, runtimeType: 'BOTH', title: '修复挑战' };
  const assignments = ['assignment', 'second'].map(id => ({ id, title: id, class: { name: '隔离班', members: students.map(user => ({ user })) }, course: { coursewareLinks: [{ courseware: ware }] } }));
  const queries = [], calls = [];
  const service = new PreparationService({
    user: { findFirst: async ({ where }) => where.id === 'teacher' ? { id: 'teacher' } : null },
    courseAssignment: { findMany: async query => { queries.push(query); return assignments; } },
  }, { get: () => 'local-inbox-unit-test-secret' });
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    assert.match(url, /^http:\/\/127\.0\.0\.1:4107\/api\/preparation/);
    if (url.endsWith('/capability')) return { ok: true, json: async () => ({ preparation: true }) };
    assert.equal(options.redirect, 'error');
    const token = options.headers['x-preparation-token'];
    const [, payload, signature] = token.split('.');
    assert.equal(signature, createHmac('sha256', 'local-inbox-unit-test-secret').update(`courseware-preparation-v1:${payload}`).digest('base64url'));
    const grant = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.equal(grant.actorId, 'teacher');
    assert.equal(grant.coursewareId, 'ware');
    assert.ok(grant.expires > Date.now() && grant.expires <= Date.now() + 60_000);
    const rows = grant.assignmentId === 'second' ? [] : [
      { id: 'student', name: 'untrusted runtime name', assetCount: 3, preparation: { status: approved ? 'APPROVED' : 'SUBMITTED', revision: 8, submittedAt: 1793710000000 } },
      { id: 'student', assetCount: 3, preparation: { status: 'SUBMITTED', submittedAt: 1793710000000 } },
      { id: 'outsider', preparation: { status: 'SUBMITTED', submittedAt: 1793710000000 } },
      { id: 'other', preparation: { status: 'RETURNED', submittedAt: 1793710000000 } },
    ];
    if (approved) rows.splice(1, 1);
    return { ok: true, json: async () => ({ students: rows }) };
  };
  return { service, queries, calls, fetcher, approve() { approved = true; } };
}

test('teacher inbox reads only owned active assignments, filters current members/submitted revisions, deduplicates and disappears after review', async () => {
  const old = global.fetch, f = inboxFixture(); global.fetch = f.fetcher;
  try {
    await assert.rejects(f.service.pendingReviews('student'));
    await assert.rejects(f.service.pendingReviews('admin'));
    assert.equal(f.queries.length, 0);
    const result = await f.service.pendingReviews('teacher');
    assert.equal(f.queries[0].where.teacherId, 'teacher');
    assert.equal(f.queries[0].where.status, 'ACTIVE');
    assert.equal(f.queries[0].where.course.status, 'PUBLISHED');
    assert.equal(f.queries[0].where.class.organization.deletedAt, null);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].studentName, '测试学生');
    assert.equal(result.items[0].assetCount, 3);
    assert.equal(result.items[0].assignmentId, 'assignment');
    assert.equal(result.unavailableCount, 0);
    assert.equal(f.calls.filter(c => c.url.endsWith('/capability')).length, 1);
    assert.ok(f.calls.every(c => !c.options?.method || c.options.method === 'GET'));
    assert.doesNotMatch(JSON.stringify(result), /prep1\.|nodePort|local-inbox-unit-test-secret/);
    f.approve();
    assert.deepEqual((await f.service.pendingReviews('teacher')).items, []);
  } finally { global.fetch = old; }
});

test('inbox distinguishes unsupported runtimes from unavailable ones and does not manufacture pending submissions', async () => {
  const old = global.fetch;
  try {
    for (const stage of ['capability', 'roster']) {
      const f = inboxFixture();
      global.fetch = async (url, options) => {
        if ((stage === 'capability') === url.endsWith('/capability')) throw new Error('offline');
        return f.fetcher(url, options);
      };
      const result = await f.service.pendingReviews('teacher');
      assert.equal(result.unavailableCount, 2);
      assert.deepEqual(result.items, []);
    }
    for (const status of [404, 405, 200]) {
      global.fetch = async () => ({ ok: status === 200, status, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }) });
      assert.deepEqual(await inboxFixture().service.pendingReviews('teacher'), { items: [], unavailableCount: 0 });
    }
    const controller = await readFile(new URL('../platform/api/src/modules/course-runtime/preparation.controller.ts', import.meta.url), 'utf8');
    assert.match(controller, /@Get\('pending-reviews'\) @UseGuards\(JwtAuthGuard\)/);
    assert.match(controller, /if \(user.readOnlyPreview\) return \{ items: \[\], unavailableCount: 0 \}/);
  } finally { global.fetch = old; }
});
function fixture(){let active=true,member=true,published=true;const users={student:{id:'student',userType:'STUDENT',displayName:'学生'},teacher:{id:'teacher',userType:'TEACHER',displayName:'教师'},outsider:{id:'outsider',userType:'TEACHER'},admin:{id:'admin',userType:'ADMIN'}};const ware={id:'ware',slug:'runtime-ware',title:'修复挑战',status:'PUBLISHED',deletedAt:null,nodePort:4107,runtimeType:'BOTH'};const assignment={id:'assignment',teacherId:'teacher',courseId:'course',classId:'class',title:'课外准备',teachingStatus:'READY',course:{id:'course',slug:'qiong',title:'邛窑'},class:{name:'隔离班'}};const prisma={user:{findFirst:async({where})=>active?users[where.id]:null},courseAssignment:{findFirst:async()=>assignment},userClass:{findUnique:async()=>member?{role:'STUDENT'}:null,findMany:async()=>[{user:users.student}]},courseCourseware:{findUnique:async()=>published?{courseware:ware}:null,findMany:async()=>[{courseware:ware}]}};const config={get:(key,otherwise)=>({JWT_ACCESS_SECRET:'local-unit-test-secret-not-a-credential',PLATFORM_PUBLIC_URL:'http://localhost:3000',AGENT_PUBLIC_URL:'http://localhost:3000/course-agent',STUDENT_PORTAL_PUBLIC_URL:'http://localhost:5173/?portal=student'}[key]||otherwise)};return{service:new PreparationService(prisma,config),revoke:()=>active=false,remove:()=>member=false,unpublish:()=>published=false};}
test('preparation grants allow assigned teacher/student before classroom opening and remain separate signed expiring credentials',async()=>{const old=global.fetch;global.fetch=async()=>({ok:true,json:async()=>({preparation:true})});try{const f=fixture();assert.equal((await f.service.options('student','assignment')).coursewares[0].coursewareId,'ware');const launch=await f.service.launch('student','assignment','ware');const url=new URL(launch.launchUrl),token=url.searchParams.get('preparationToken');assert.equal(url.searchParams.get('prepare'),'1');assert.equal(url.searchParams.has('launchToken'),false);assert.equal(url.searchParams.get('returnUrl'),'http://localhost:5173/?portal=student');const c=(await f.service.verify(token)).context;assert.equal(c.role,'STUDENT');assert.equal(c.assignment.teachingStatus,'READY');assert.deepEqual(c.students,[]);await assert.rejects(f.service.verify(token+'x'));const teacherToken=new URL((await f.service.launch('teacher','assignment','ware')).launchUrl).searchParams.get('preparationToken');assert.equal((await f.service.verify(teacherToken)).context.students[0].id,'student');await assert.rejects(f.service.launch('outsider','assignment','ware'));await assert.rejects(f.service.launch('admin','assignment','ware'));f.remove();await assert.rejects(f.service.verify(token));const expiredPayload=Buffer.from(JSON.stringify({actorId:'student',assignmentId:'assignment',coursewareId:'ware',expires:Date.now()-1})).toString('base64url');const signature=createHmac('sha256','local-unit-test-secret-not-a-credential').update(`courseware-preparation-v1:${expiredPayload}`).digest('base64url');await assert.rejects(f.service.verify(`prep1.${expiredPayload}.${signature}`));const disabled=fixture();const valid=new URL((await disabled.service.launch('student','assignment','ware')).launchUrl).searchParams.get('preparationToken');disabled.revoke();await assert.rejects(disabled.service.verify(valid));const unpublished=fixture();unpublished.unpublish();await assert.rejects(unpublished.service.launch('student','assignment','ware'));}finally{global.fetch=old;}});
