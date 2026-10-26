import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { requireValue, cleanText, digest, imageBuffer, normalizedMask, compositeMasked, hasEvidenceNote, LessonError } from './domain.mjs';
import { proposalPrompt } from './proposal-prompt.mjs';
import { proposalAllowance, PROPOSAL_PROMPT_VERSION } from '../shared/proposal-generation.mjs';
import { assertApproved } from './preparation.mjs';
import { preparationEvidence, clueLabel } from '../shared/preparation-evidence.mjs';

export const isProposal = task => task.workflowVersion === 2 && task.kind === 'proposal';
export function publicProposal(task) {
  return { id: task.id, requestId: task.requestId, workflowVersion: 2, kind: 'proposal', createdAt: task.createdAt, model: task.model, mocked: task.mocked,
    snapshot: task.snapshot, results: task.results, aiState: task.results[0]?.state || 'not_requested',
    maskDataUrl: `data:image/png;base64,${task.maskPngBase64}` };
}
export function validateProposal(owner, input) {
  const text = cleanText(input.proposalText, 501);
  requireValue(text.length >= 4 && text.length <= 500, '请用4—500字写清怎样复原、依据是什么');
  const ids = input.clueIds, clues = preparationEvidence(owner.assets).clues;
  requireValue(Array.isArray(ids) && ids.length >= 1 && ids.length <= 3 && new Set(ids).size === ids.length, '请选择1—3张本次采用的线索');
  requireValue(ids.every(id => clues.some(a => a.id === id && hasEvidenceNote(a))), '所选线索须属于本任务，并有来源和一句发现');
  return { proposalText: text, clueIds: [...ids] };
}

export function createProposals({ root, model, mock, provider, persist, withOwnerLock, assertVersion, assetPath, body, json }) {
  const active = owner => owner.tasks.filter(isProposal);
  const find = (owner, id) => { const task = active(owner).find(t => t.id === id && t.ownerId === owner.id); requireValue(task, '找不到本次方案，或方案已重置', 'NOT_FOUND', 404); return task; };
  const busy = owner => owner.tasks.some(t => t.results.some(r => ['pending', 'running'].includes(r.state)));
  async function run(owner, task) {
    const result = task.results[0];
    await withOwnerLock(owner, async () => { result.state = 'running'; await persist(owner); });
    let changes, diagnostics = {};
    try {
      const target = await readFile(join(root, 'static/assets/case-damaged.png'));
      const refs = await Promise.all(task.snapshot.clueIds.map(id => readFile(assetPath(owner, id))));
      const inputs = [target, ...refs].map(bytes => `data:image/png;base64,${bytes.toString('base64')}`);
      const inputHashes = [digest(target), ...refs.map(digest)]; diagnostics = {inputHashes,promptHash:digest(task.snapshot.prompt),referenceCount:refs.length};
      if (mock && process.env.AI_TEST_FAIL_KEY === 'proposal' && result.attempts === 1) throw new LessonError(502, 'MOCK_FAILURE', '模拟生成失败，请手动重试');
      if (mock && process.env.AI_TEST_UNKNOWN_KEY === 'proposal') throw new LessonError(504, 'AI_RESULT_UNKNOWN', '生成结果状态待确认，不会自动重复请求；请联系老师确认');
      const output = await provider(inputs, task.snapshot.prompt);
      const composite = await compositeMasked(target, output, Buffer.from(task.maskBase64, 'base64'));
      const fileId = randomUUID(); await writeFile(assetPath(owner, fileId), composite, { mode: 0o600 });
      changes = { state: 'succeeded', fileId, inputHashes, promptHash: digest(task.snapshot.prompt), referenceCount: refs.length, finishedAt: Date.now() };
    } catch (error) {
      changes = { state: error.code === 'AI_RESULT_UNKNOWN' ? 'unknown' : 'failed', error: error instanceof LessonError ? error.message : '图片暂未生成，请重试或联系老师', code: error.code || 'PROCESSING_FAILED' };
    }
    await withOwnerLock(owner, async () => { Object.assign(result, diagnostics, changes); await persist(owner); });
  }
  async function handle(req, res, path, owner) {
    if (!path.startsWith('/api/proposals')) return false;
    requireValue(!req.preparationOnly && (req.lessonDemo || req.lessonContext?.student?.userType === 'STUDENT' || req.lessonContext?.role === 'STUDENT'), '请从学生课堂进入方案制作', 'PROPOSAL_FORBIDDEN', 403);
    const match = path.match(/^\/api\/proposals(?:\/([a-zA-Z0-9-]+)(?:\/(generate|retry))?)?$/);
    requireValue(match, '方案操作不存在', 'NOT_FOUND', 404);
    const reply = (status, task) => json(res, status, { proposal: publicProposal(task), proposalGeneration: proposalAllowance(owner) });
    if (req.method === 'GET' && match[1] && !match[2]) { reply(200, find(owner, match[1])); return true; }
    requireValue(req.method === 'POST', '不支持的方案操作', 'NOT_FOUND', 404);
    await withOwnerLock(owner, async () => {
      // The platform proxy may omit an empty JSON object; action routes need no body.
      assertVersion(req, owner); const input = match[1] ? {} : await body(req);
      if (!match[1]) {
        requireValue(/^[a-zA-Z0-9-]{16,80}$/.test(input.requestId || ''), '方案请求编号无效');
        requireValue(!owner.resetHistory?.some(h => !h.restored && h.tasks.some(t => t.requestId === input.requestId)), '原方案已重置，请重新开始', 'LESSON_RESET', 409);
        const same = active(owner).find(t => t.requestId === input.requestId);
        const value = validateProposal(owner, input);
        const approval = req.lessonDemo ? null : assertApproved(owner);
        const target = await readFile(join(root, 'static/assets/case-damaged.png')), metadata = await sharp(target).metadata();
        const maskBytes = input.maskDataUrl ? imageBuffer(input.maskDataUrl) : await readFile(join(root, 'static/assets/case-mask.png'));
        const mask = await normalizedMask(maskBytes, metadata.width, metadata.height, true);
        const requestHash = digest(JSON.stringify({ ...value, maskHash:digest(mask.data) }));
        if (same) { requireValue(req.lessonDemo || same.snapshot.preparation?.evidenceDigest === approval.evidenceDigest, '线索已更新，请修改并保存新方案', 'STALE_PROPOSAL', 409); requireValue(same.requestHash === requestHash, '方案已改变，请保存为新方案', 'STALE_PROPOSAL', 409); reply(200, same); return; }
        requireValue(active(owner).length < 100, '保存的方案过多，请联系老师整理', 'PROPOSAL_LIMIT', 429);
        const maskPng = await sharp(mask.data, { raw: { width: mask.width, height: mask.height, channels: 1 } }).png().toBuffer();
        const evidence = value.clueIds.map(id => { const a = owner.assets.find(asset => asset.id === id); return { ...a, label: clueLabel(a, owner.assets) }; });
        const prompt = proposalPrompt(value.proposalText, evidence, mask.bounds, mask.width, mask.height);
        const task = { id: randomUUID(), ownerId: owner.id, kind: 'proposal', workflowVersion: 2, requestId: input.requestId, requestHash,
          createdAt: Date.now(), model, mocked: mock, maskBase64: mask.data.toString('base64'), maskPngBase64: maskPng.toString('base64'), results: [],
          snapshot: { ...value, evidence, preparation: approval, width: mask.width, height: mask.height, bounds: mask.bounds, maskPixels: mask.pixels,
            maskHash: digest(mask.data), targetHash: digest(target), prompt, promptVersion: PROPOSAL_PROMPT_VERSION } };
        const next = {...owner,tasks:[...owner.tasks,task]}; await persist(next); Object.assign(owner,next); reply(201, task); return;
      }
      const task = find(owner, match[1]);
      const before = structuredClone(task), counter = owner.proposalGenerationCount, used = owner.assets.map(a => a.usedInGeneration);
      if (match[2] === 'generate') {
        if (task.results.length) { reply(200, task); return; }
        requireValue(!busy(owner), '已有图片正在生成，请稍候', 'GENERATION_RUNNING', 409);
        if (!req.lessonDemo) { const approved = assertApproved(owner); requireValue(approved.evidenceDigest === task.snapshot.preparation.evidenceDigest, '线索已更新，请保存新方案', 'STALE_PROPOSAL', 409); }
        requireValue(task.snapshot.evidence.every(a => owner.assets.some(now => now.id === a.id && now.hash === a.hash)), '线索已变化，请保存新方案', 'STALE_PROPOSAL', 409);
        requireValue(process.env.ARK_API_KEY || mock, 'AI服务暂不可用，草稿已保留，请联系老师', 'AI_NOT_CONFIGURED', 503);
        requireValue(task.snapshot.maskPixels >= 40, '请先标出修复位置，也可点击“恢复初始区域”');
        const allowance = proposalAllowance(owner);
        requireValue(allowance.remaining > 0, '本次任务的3次生成机会已用完，请选用已有成功效果或联系老师', 'AI_VERSION_LIMIT', 429);
        owner.proposalGenerationCount = allowance.used + 1;
        task.results = [{ key: 'evidence', title: '我的AI复原效果', state: 'pending', attempts: 1 }];
        for (const a of owner.assets) if (task.snapshot.clueIds.includes(a.id)) a.usedInGeneration = true;
      } else if (match[2] === 'retry') {
        requireValue(!busy(owner), '图片仍在生成，请稍候', 'GENERATION_RUNNING', 409);
        if (!req.lessonDemo) { const approved = assertApproved(owner); requireValue(approved.evidenceDigest === task.snapshot.preparation.evidenceDigest, '线索已更新，请保存新方案', 'STALE_PROPOSAL', 409); }
        const result = task.results[0]; requireValue(result?.state === 'failed' && result.attempts < 2, '仅可手动重试一次明确失败项；状态待确认的请求不会重发');
        for (const field of ['error', 'code']) delete result[field]; result.state = 'pending'; result.attempts++;
      } else throw new LessonError(404, 'NOT_FOUND', '方案操作不存在');
      try { await persist(owner); } catch (error) { Object.assign(task,before); if(counter===undefined)delete owner.proposalGenerationCount;else owner.proposalGenerationCount=counter; owner.assets.forEach((a,i)=>{if(used[i]===undefined)delete a.usedInGeneration;else a.usedInGeneration=used[i];}); throw error; } reply(202, task); void run(owner, task).catch(() => {});
    });
    return true;
  }
  return { handle };
}
