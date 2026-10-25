import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { preparationAccess } from '../shared/preparation-schedule.mjs';
import { preparationEvidence, CLUE_INSTRUCTIONS } from '../shared/preparation-evidence.mjs';
import { digest, cleanText, requireValue, hasEvidenceNote } from './domain.mjs';
export const preparationDigest = assets => digest(JSON.stringify(assets.map(({ usedInGeneration, ...a }) => a).sort((a,b) => a.id.localeCompare(b.id))));
export function preparationState(owner) { return owner.preparation || { status: 'DRAFT', revision: 0 }; }
export function assertEditable(owner) { requireValue(!owner.tasks.some(t=>t.results.some(r=>['pending','running'].includes(r.state))), '实验正在生成，请完成后再修改资料', 'EXPERIMENT_RUNNING',409); requireValue(['DRAFT', 'RETURNED'].includes(preparationState(owner).status), '请先选择“修改并重新提交”，修改后需要老师重新审核', 'PREPARATION_LOCKED', 409); }
export function changed(owner) { const old = preparationState(owner); owner.preparation = { status: 'DRAFT', revision: old.revision + 1, feedback: old.feedback || '' }; }
export function validatePreparation(owner, workflowVersion = 1) {
  if (workflowVersion === 2) { const clues = preparationEvidence(owner.assets).clues; requireValue(clues.length >= 1, '请至少上传1张自己的线索图片'); requireValue(clues.every(hasEvidenceNote), '请为每张采用的线索填写来源和一句自己的发现'); return; }
  const selected = owner.assets.filter(a => a.role !== 'excluded');
  const refs = selected.filter(a => a.role === 'reference'), held = selected.filter(a => a.role === 'holdout');
  requireValue(refs.length >= 1 && refs.length <= 3 && held.length >= 2 && held.length <= 3, '请选择1—3张生成参考、2—3张核验保留；其余资料设为排除');
  requireValue(selected.every(a => (!a.origin || a.origin === 'student') && !a.builtinId), '请提交自己课外收集的资料，教师备用包不能代替课外准备');
  requireValue(selected.every(hasEvidenceNote), '请为每张采用的图片填写来源和一句自己的发现');
}
export function assertApproved(owner) {
  const p = preparationState(owner);
  requireValue(p.status === 'APPROVED' && p.evidenceDigest === preparationDigest(owner.assets), '课外资料必须先提交并经老师审核通过，才能开始课堂实验', 'PREPARATION_APPROVAL_REQUIRED', 403);
  return { ...p };
}
export function assertPreparationOpen(settings, owner) {
  const access = preparationAccess(settings,owner);
  const messages = { NOT_STARTED:'课外准备尚未开始，请在开放时间后上传', CLOSED:'课外准备已截止；已审核资料仍可用于课堂，如需补交请联系老师', PAUSED:'老师尚未开放或已关闭常规上传；已审核资料仍可用于课堂', INVALID:'准备时间配置无效，请联系老师' };
  requireValue(access.open,messages[access.status] || '课外准备暂不可上传','PREPARATION_CLOSED',403);
}
function scheduleDate(value, label) {
  if (value === null || value === '') return null;
  requireValue(typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), `请填写有效的${label}（含时区）`);
  return new Date(value).toISOString();
}
export function createPreparation({ dataRoot, atomicJson, getOwner, persist, withOwnerLock, json, body, assetPath }) {
  const configurations = new Map();
  const key = c => digest(`${c.assignment.id}:${c.courseware.id}`).slice(0,40);
  async function settings(c) { const id = key(c); if (!configurations.has(id)) { let value; try { value = JSON.parse(await readFile(join(dataRoot, `preparation-${id}.json`), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; } configurations.set(id, value || { enabled: false, opensAt: null, closesAt: null, instructions: '课外寻找与邛窑器物修复有关的图片，记下图片从哪里来，以及一句自己的发现。选择1—3张生成参考，保留2—3张仅供核验。不要把AI生成图当作历史证据。' }); } return configurations.get(id); }
  async function target(c, studentId) { requireValue(c.role === 'TEACHER' && c.students.some(s => s.id === studentId), '只能查看本任务班级学生的资料', 'PREPARATION_FORBIDDEN', 403); return getOwner(`${studentId}:${c.assignment.id}:${c.courseware.id}`); }
  async function handle(req, res, path, c, owner) {
    const config = await settings(c), teacher = c.role === 'TEACHER';
    if (path === '/api/preparation' && req.method === 'GET') { const roster = teacher ? await Promise.all(c.students.map(async s => { const o = await target(c,s.id); return { ...s, preparation: preparationState(o), preparationExtension: o.preparationExtension || null, access: preparationAccess(config,o), assetCount: preparationEvidence(o.assets).counts.active, assetCounts: preparationEvidence(o.assets).counts }; })) : undefined; json(res,200,{ context:c, settings:config, serverNow:Date.now(), resetVersion:owner.resetVersion||0, workflowVersion:2, defaultInstructions:CLUE_INSTRUCTIONS, access:teacher ? undefined : preparationAccess(config,owner), preparationExtension:teacher ? undefined : owner.preparationExtension || null, preparation:teacher ? undefined : preparationState(owner), assets:teacher ? undefined : owner.assets, students:roster }); return true; }
    if (path === '/api/preparation/settings' && req.method === 'POST') { requireValue(teacher,'只有任课教师可以布置任务','PREPARATION_FORBIDDEN',403); const b = await body(req); requireValue(typeof b.enabled === 'boolean', '请设置是否开放准备'); const value = { workflowVersion:b.workflowVersion === 2 ? 2 : config.workflowVersion || 1, enabled:b.enabled, opensAt:scheduleDate(b.opensAt === undefined ? config.opensAt || null : b.opensAt, '准备开始时间'), closesAt:scheduleDate(b.closesAt === undefined ? config.closesAt || null : b.closesAt, '准备截止时间'), instructions:cleanText(b.instructions,3000), updatedAt:Date.now(), teacherId:c.actor.id }; requireValue(value.instructions.length >= 8,'请写明课外准备要求'); requireValue(!value.opensAt || !value.closesAt || Date.parse(value.closesAt) > Date.parse(value.opensAt),'准备截止时间必须晚于开始时间'); await withOwnerLock({id:`config-${key(c)}`},async()=>{ await atomicJson(join(dataRoot,`preparation-${key(c)}.json`),value); configurations.set(key(c),value); }); json(res,200,{ settings:value }); return true; }
    if (path === '/api/preparation/submit' && req.method === 'POST') { requireValue(!teacher,'请由学生提交自己的资料','PREPARATION_FORBIDDEN',403); const input=await body(req); const version=input.workflowVersion === 2 ? 2 : 1; await withOwnerLock(owner,async()=>{ assertPreparationOpen(config,owner); assertEditable(owner); validatePreparation(owner,version); const previous=preparationState(owner); owner.preparation={ workflowVersion:version, status:'SUBMITTED', revision:previous.revision, submittedAt:Date.now(), evidenceDigest:preparationDigest(owner.assets) }; delete owner.preparationExtension; await persist(owner); json(res,200,{preparation:owner.preparation}); }); return true; }
    if (path === '/api/preparation/reopen' && req.method === 'POST') { requireValue(!teacher,'请由学生修改本人资料','PREPARATION_FORBIDDEN',403); assertPreparationOpen(config,owner); await withOwnerLock(owner,async()=>{ requireValue(!owner.tasks.some(t=>t.results.some(r=>['pending','running'].includes(r.state))),'实验正在生成，请完成后再修改'); changed(owner); await persist(owner); json(res,200,{preparation:owner.preparation}); }); return true; }
    const match=path.match(/^\/api\/preparation\/students\/([^/]+)(?:\/(review|files|supplement)\/?([^/]+)?)?$/);
    if (match) { const student=await target(c,match[1]);
      if (req.method==='GET' && !match[2]) { json(res,200,{assets:student.assets,preparation:preparationState(student),preparationExtension:student.preparationExtension || null,access:preparationAccess(config,student)}); return true; }
      if (req.method==='GET' && match[2]==='files') { requireValue(student.assets.some(a=>a.id===match[3]),'资料不存在','NOT_FOUND',404); const bytes=await readFile(assetPath(student,match[3])); json(res,200,{dataUrl:`data:image/png;base64,${bytes.toString('base64')}`}); return true; }
      if (req.method==='POST' && match[2]==='supplement') { const b=await body(req); await withOwnerLock(student,async()=>{ if(b.until === null) delete student.preparationExtension; else { assertEditable(student); const until=scheduleDate(b.until,'补交截止时间'); requireValue(until && Date.parse(until)>Date.now(),'补交截止时间须晚于当前时间'); student.preparationExtension={until,teacherId:c.actor.id,grantedAt:Date.now()}; } await persist(student); json(res,200,{preparationExtension:student.preparationExtension || null,access:preparationAccess(config,student)}); }); return true; }
      if (req.method==='POST' && match[2]==='review') { const b=await body(req); await withOwnerLock(student,async()=>{ const p=preparationState(student); requireValue(p.status==='SUBMITTED' && b.revision===p.revision && b.evidenceDigest===p.evidenceDigest,'学生已更新资料，请重新读取后审核','STALE_REVIEW',409); requireValue(['APPROVED','RETURNED'].includes(b.decision),'请选择通过或退回'); const feedback=cleanText(b.feedback,1200); requireValue(b.decision!=='RETURNED'||feedback.length>=4,'退回时请说明补充要求'); validatePreparation(student,p.workflowVersion || 1); student.preparation={...p,status:b.decision,feedback,teacherId:c.actor.id,teacherName:c.actor.name,reviewedAt:Date.now(),...(b.decision==='APPROVED'?{approvedAt:Date.now()}:{})}; await persist(student); json(res,200,{preparation:student.preparation}); }); return true; }
    }
    return false;
  }
  return { settings, handle };
}
