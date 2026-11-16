import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const LIMIT = 3;
const activeStates = new Set(['submitting', 'queued', 'running', 'downloading', 'unknown']);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
export class VideoError extends Error {
  constructor(code, message, statusCode = 400, retryable = false) {
    super(message); Object.assign(this, { code, statusCode, retryable });
  }
}
const requireValue = (condition, ...args) => { if (!condition) throw new VideoError(...args); };

function matchesRuntime(context, options) {
  if (context.courseware?.slug !== (options.coursewareSlug || 'four-panel-story-studio')) return false;
  if (options.coursewareId) return context.courseware.id === options.coursewareId;
  if (context.course?.slug === (options.courseSlug || 'can-machines-learn')) return true;
  // A teaching course may reference this same deployed courseware. Its classroom
  // slug differs, while the platform-verified source entry still identifies us.
  try {
    const expected = new URL(options.publicUrl);
    const actual = new URL(context.courseware.entryUrl);
    const base = expected.pathname.replace(/\/+$/, '');
    return actual.origin === expected.origin && Boolean(base) &&
      (actual.pathname.replace(/\/+$/, '') === base || actual.pathname.startsWith(base + '/'));
  } catch { return false; }
}

export function videoPrompt(comic, mood) {
  const panels = (comic.panels || []).slice(0, 4).map((panel, index) =>
    `${['起', '承', '转', '合'][index]}：${String(panel.visual || panel.caption || panel.voiceLine || '').slice(0, 350)}`);
  return `以首帧四格漫画作为角色、画风及故事分镜参考，生成10秒16:9连续故事动画。\n` +
    `故事：${String(comic.title || '我的四格故事').slice(0, 80)}\n${panels.join('\n')}\n` +
    '首帧后镜头进入画格，依照起承转合逐格展开成全屏动画。前3秒表现起因，第3至5秒表现发展，第5至8秒表现转折，最后2秒准确呈现第四格的结局。' +
    '保持参考图中的角色数量、脸部、服装、场景、关键物件与美术风格一致，让人物、环境与物件有自然动作，镜头平稳推进与切换。' +
    '严格忠实四格事件和最终结局，不增添支线或改变角色关系；画面保持纯动画，不生成文字或字幕。' +
    `声音使用与画面同步的环境音效和${mood === 'fast' ? '轻快活泼' : '柔和温暖'}的背景音乐，角色通过表情和动作讲故事，不添加旁白。`;
}

export async function createSeedanceVideoService(options) {
  const { dataDir, mediaDir, loadMeta, saveMeta, mediaUrl, recordGenerationStep, probeDuration } = options;
  const fetcher = options.fetchImpl || fetch;
  const platform = String(options.platformBase || '').replace(/\/+$/, '');
  const model = options.model || 'doubao-seedance-2-0-fast-260128';
  const root = join(dataDir, 'video-jobs');
  const owners = new Map(), locks = new Map(), downloads = new Map();
  await mkdir(root, { recursive: true, mode: 0o700 });
  async function persist(owner) {
    const path = join(root, `${owner.id}.json`), temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(owner), { mode: 0o600 });
    await rename(temp, path);
  }
  // A crash between submission and receipt of the provider ID must never trigger another paid POST.
  for (const name of await readdir(root)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const owner = JSON.parse(await readFile(join(root, name), 'utf8'));
    requireValue(owner.id === name.slice(0, -5) && Array.isArray(owner.jobs), 'VIDEO_JOURNAL_INVALID', '视频记录需要维护，请联系老师。', 503);
    for (const job of owner.jobs) if (job.status === 'submitting') {
      job.status = 'unknown'; job.message = '视频提交结果待确认，已保留本次额度，请联系老师核查；系统不会重复提交。';
    }
    owners.set(owner.id, owner);
    await persist(owner);
  }
  async function locked(id, operation) {
    const prior = locks.get(id) || Promise.resolve();
    const next = prior.catch(() => {}).then(operation); locks.set(id, next);
    try { return await next; } finally { if (locks.get(id) === next) locks.delete(id); }
  }
  async function identify(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const demoId = String(req.headers['x-demo-id'] || '');
    if (!token && options.allowLocalDemo && uuid(demoId)) return hash(`local-demo:${demoId}`);
    requireValue(token && platform, 'LAUNCH_REQUIRED', '请从学生后台的课堂任务进入课件。', 401);
    let response;
    try {
      response = await fetcher(`${platform}/course-runtime/launch/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ launchToken: token }), signal: AbortSignal.timeout(12000),
      });
    } catch { throw new VideoError('PLATFORM_UNAVAILABLE', '课堂连接暂时不可用，请稍后再试。', 503, true); }
    requireValue(response.status < 500 && response.status !== 429, 'PLATFORM_UNAVAILABLE', '课堂连接暂时不可用，请稍后再试。', 503, true);
    requireValue(response.ok, 'LAUNCH_INVALID', '课堂凭证已失效或任务已关闭，请返回后台重新进入。', 401);
    let c;
    try { ({ context: c } = await response.json()); }
    catch { throw new VideoError('PLATFORM_UNAVAILABLE', '课堂返回暂时无法读取，请稍后重试。', 503, true); }
    requireValue(c?.student?.id && c.assignment?.id && c.courseware?.id &&
      matchesRuntime(c, options),
    'LAUNCH_MISMATCH', '当前启动信息不属于本课件的学生课堂。', 403);
    return hash(`${c.student.id}:${c.assignment.id}:${c.courseware.id}`);
  }
  function ownerFor(id) {
    if (!owners.has(id)) owners.set(id, { id, jobs: [] });
    return owners.get(id);
  }
  function publicJob(job) {
    if (!job) return null;
    return { requestId: job.id, status: job.status, message: job.message || '',
      startedAt: job.startedAt, generationId: job.generationId, comicId: job.comicId,
      audioId: job.audioId, selectedComic: job.comic, audioUrl: job.audioUrl,
      transcript: job.transcript || '', comics: job.comics || [job.comic],
      result: job.result || null, code: job.code || null };
  }
  function allowance(owner) {
    const used = owner.jobs.filter(job => job.status !== 'failed').length;
    return { scopeId: owner.id, limit: LIMIT, used, remaining: Math.max(0, LIMIT - used),
      activeJob: publicJob(owner.jobs.find(job => activeStates.has(job.status))),
      latestJob: publicJob(owner.jobs.at(-1)) };
  }
  async function provider(path, body) {
    return fetcher(`https://ark.cn-beijing.volces.com/api/v3${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
    });
  }
  async function step(job, patch) {
    if (job.generationId) await recordGenerationStep(job.generationId, 'video', {
      requestId: job.id, model, provider: 'seedance', ...patch,
    });
  }
  function download(owner, job, url, duration, usage) {
    const key = `${owner.id}:${job.id}`;
    if (downloads.has(key)) return;
    const flight = (async () => {
      try {
        requireValue(new URL(url).protocol === 'https:', 'VIDEO_DOWNLOAD_INVALID', '视频地址暂不可用。', 502, true);
        const response = await fetcher(url, { signal: AbortSignal.timeout(90000) });
        requireValue(response.ok, 'VIDEO_DOWNLOAD_FAILED', '视频已生成，正在重新获取文件。', 502, true);
        const contentLength = Number(response.headers.get('content-length') || 0);
        requireValue(contentLength < 50 * 1024 * 1024, 'VIDEO_TOO_LARGE', '视频文件超出课堂保存限制，请联系老师。', 502);
        const bytes = Buffer.from(await response.arrayBuffer());
        requireValue(bytes.length > 0 && bytes.length < 50 * 1024 * 1024, 'VIDEO_DOWNLOAD_FAILED', '视频文件尚未完整获取，请稍后继续查看。', 502, true);
        const outputPath = join(mediaDir, `${job.videoId}.mp4`);
        await writeFile(`${outputPath}.tmp`, bytes); await rename(`${outputPath}.tmp`, outputPath);
        const actualDuration = probeDuration ? await probeDuration(outputPath).catch(() => duration) : duration;
        const segment = actualDuration / 4;
        const timestamp = value => {
          const ms = Math.round(value * 1000);
          return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
        };
        const captions = 'WEBVTT\n\n' + (job.comic.panels || []).slice(0, 4).map((panel, index) =>
          `${index + 1}\n${timestamp(index * segment)} --> ${timestamp((index + 1) * segment)}\n${String(panel.caption || panel.voiceLine || '').replace(/[<>\r\n]/g, ' ')}\n`).join('\n');
        await writeFile(join(mediaDir, `${job.videoId}.vtt`), captions);
        const result = { generationId: job.generationId, videoId: job.videoId,
          videoUrl: mediaUrl(`${job.videoId}.mp4`), captionsUrl: mediaUrl(`${job.videoId}.vtt`),
          mimeType: 'video/mp4', durationSeconds: actualDuration, bgmMood: job.bgmMood, provider: 'seedance', model };
        await saveMeta(job.videoId, { ...result, id: job.videoId, kind: 'video', path: outputPath,
          title: job.comic.title, panels: job.comic.panels, audioId: job.audioId, comicId: job.comicId,
          usage, createdAt: new Date().toISOString() });
        await locked(owner.id, async () => {
          Object.assign(job, { status: 'succeeded', result, usage, finishedAt: new Date().toISOString(), message: '' });
          await persist(owner);
          await step(job, { status: 'success', videoId: job.videoId, durationSeconds: actualDuration });
        });
      } catch {
        await locked(owner.id, async () => {
          job.message = '视频已生成，文件正在准备；点击继续等待即可获取，不会重复扣次数。';
          await persist(owner);
        });
      } finally { downloads.delete(key); }
    })();
    downloads.set(key, flight);
  }
  async function refresh(owner, job) {
    if (!job?.providerTaskId || !activeStates.has(job.status)) return;
    let response, remote;
    try {
      response = await provider(`/contents/generations/tasks/${encodeURIComponent(job.providerTaskId)}`);
      if (!response.ok) { job.message = '暂时未能查询视频状态，正在继续等待原任务。'; return; }
      remote = await response.json();
    } catch { job.message = '课堂网络有些慢，正在继续查询原视频。'; return; }
    if (['failed', 'cancelled', 'expired'].includes(remote.status)) {
      Object.assign(job, { status: 'failed', code: 'VIDEO_GENERATION_FAILED',
        message: '这次视频未能生成，次数已退回，录音和漫画已保留。', finishedAt: new Date().toISOString() });
      await persist(owner); await step(job, { status: 'failed', code: job.code, message: job.message }); return;
    }
    if (remote.status === 'succeeded' && remote.content?.video_url) {
      job.status = 'downloading'; job.message = '视频已生成，正在准备播放文件。';
      await persist(owner);
      download(owner, job, remote.content.video_url, Number(remote.duration) || 10, remote.usage);
    } else {
      job.status = remote.status === 'running' ? 'running' : 'queued'; job.message = '';
      await persist(owner);
    }
  }
  async function quota(req) {
    const id = await identify(req);
    return locked(id, async () => {
      const owner = ownerFor(id); await refresh(owner, owner.jobs.find(job => activeStates.has(job.status)));
      return allowance(owner);
    });
  }
  async function status(req, body) {
    const id = await identify(req);
    return locked(id, async () => {
      const owner = ownerFor(id), job = owner.jobs.find(job => job.id === body.requestId);
      requireValue(job, 'VIDEO_NOT_FOUND', '找不到这堂课的视频任务。', 404);
      await refresh(owner, job); return { job: publicJob(job), quota: allowance(owner) };
    });
  }
  async function start(req, body) {
    const id = await identify(req);
    requireValue(uuid(body.requestId), 'VIDEO_REQUEST_INVALID', '视频请求编号无效，请刷新页面重试。');
    return locked(id, async () => {
      const owner = ownerFor(id);
      const prior = owner.jobs.find(job => job.id === body.requestId);
      if (prior) {
        requireValue(prior.audioId === body.audioId && prior.comicId === body.comicId,
          'VIDEO_REQUEST_CONFLICT', '这次请求对应另一份作品，请继续查看原视频。', 409);
        return { job: publicJob(prior), quota: allowance(owner) };
      }
      const active = owner.jobs.find(job => activeStates.has(job.status));
      if (active) return { job: publicJob(active), quota: allowance(owner) };
      requireValue(allowance(owner).remaining > 0, 'VIDEO_LIMIT_REACHED', '本堂课的3次视频生成机会已用完，可以继续查看和提交已有作品。', 429);
      requireValue(options.apiKey, 'VIDEO_NOT_CONFIGURED', '视频生成暂未配置好，请联系老师。', 503, true);
      const audio = await loadMeta(String(body.audioId || '')), comic = await loadMeta(String(body.comicId || ''));
      requireValue(audio?.kind === 'audio' && comic?.kind === 'comic', 'VIDEO_INPUT_MISSING', '找不到录音或选中的漫画，请返回前面步骤。', 404);
      requireValue(!audio.generationId || !comic.generationId || audio.generationId === comic.generationId,
        'VIDEO_INPUT_MISMATCH', '录音和漫画不属于同一份作品。', 409);
      const bytes = await readFile(comic.path);
      requireValue(bytes.length > 0 && bytes.length < 30 * 1024 * 1024, 'VIDEO_IMAGE_INVALID', '漫画文件暂不可用，请重新选择。');
      const selected = {};
      for (const name of ['comicId', 'candidateId', 'title', 'imageUrl', 'mimeType', 'styleIndex', 'styleKey', 'styleLabel', 'actualStyleLabel', 'layout', 'panels']) selected[name] = comic[name];
      selected.comicId = body.comicId;
      const generation = await loadMeta(audio.generationId || comic.generationId || '');
      // A partial comic retry may replace the latest step snapshot. Recover all current
      // candidates from their server metadata instead of trusting client image URLs.
      const candidateIds = [...new Set(Array.isArray(body.comicIds) ? body.comicIds.slice(0, 4) : [])];
      const candidateMeta = await Promise.all(candidateIds.map(value => loadMeta(String(value))));
      const recovered = candidateMeta.filter(item => item?.kind === 'comic' &&
        (!audio.generationId || item.generationId === audio.generationId)).map(item => {
        const snapshot = {};
        for (const name of Object.keys(selected)) snapshot[name] = item[name];
        return snapshot;
      });
      const choices = new Map((recovered.length ? recovered : generation?.steps?.comics?.comics || []).map(item => [item.comicId, item]));
      choices.delete(selected.comicId);
      const currentComics = [...choices.values()].slice(0, 3).concat(selected).sort((a, b) => Number(a.styleIndex || 0) - Number(b.styleIndex || 0));
      const job = { id: body.requestId, videoId: randomUUID(), status: 'submitting',
        startedAt: new Date().toISOString(), audioId: body.audioId, comicId: body.comicId,
        generationId: audio.generationId || comic.generationId || '', comic: selected,
        comics: currentComics, transcript: audio.transcript || '',
        audioUrl: mediaUrl(basename(audio.path)), bgmMood: body.bgmMood === 'fast' ? 'fast' : 'soft' };
      owner.jobs.push(job); await persist(owner);
      await step(job, { status: 'running', audioId: job.audioId, comicId: job.comicId });
      // No automatic retry of this POST: a timeout can mean the provider already created a paid task.
      try {
        const mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg';
        const response = await provider('/contents/generations/tasks', { model,
          content: [{ type: 'text', text: videoPrompt(comic, job.bgmMood) },
            { type: 'image_url', role: 'first_frame', image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } }],
          ratio: '16:9', duration: 10, resolution: '720p', generate_audio: true, watermark: false });
        if (!response.ok) {
          if (response.status >= 400 && response.status < 500 && response.status !== 408) {
            job.status = 'failed'; job.code = 'VIDEO_SUBMIT_REJECTED';
            job.message = '视频服务没有接受这次请求，次数已退回，请稍后重试或联系老师。';
          } else throw new Error('submission uncertain');
        } else {
          const remote = await response.json();
          if (!remote.id) throw new Error('missing task ID');
          job.providerTaskId = remote.id; job.status = 'queued';
        }
      } catch {
        job.status = 'unknown'; job.code = 'VIDEO_SUBMIT_UNKNOWN';
        job.message = '视频提交结果待确认，已保留本次额度，请联系老师核查；系统不会重复提交。';
      }
      await persist(owner);
      return { job: publicJob(job), quota: allowance(owner) };
    });
  }
  return { start, status, quota, model, limit: LIMIT,
    async settleDownloads() { await Promise.all(downloads.values()); } };
}
