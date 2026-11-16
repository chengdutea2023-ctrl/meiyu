import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createSeedanceVideoService, videoPrompt } from '../coursewares/four-panel-story-studio/server/seedance-video.mjs';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'four-panel-video-test-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const mediaDir = join(dataDir, 'media'); await mkdir(mediaDir);
  const imagePath = join(mediaDir, 'fixture.jpg'); await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const generationId = randomUUID(), audioId = randomUUID(), comicId = randomUUID();
  const panels = ['开始', '发展', '转折', '回家'].map(caption => ({ caption, visual: caption }));
  const meta = new Map([
    [audioId, { id: audioId, kind: 'audio', generationId, path: join(mediaDir, 'voice.mp3'), transcript: '我的故事' }],
    [comicId, { comicId, kind: 'comic', generationId, path: imagePath, imageUrl: '/lesson/media/fixture.jpg', title: '回家的故事', panels }],
  ]);
  const state = { creates: 0, queries: 0, remoteStatus: 'succeeded', submitStatus: 200, verificationStatus: 200,
    networkError: false, downloadFails: false, payloads: [], student: 'student-a', assignment: 'lesson-a',
    courseSlug: 'can-machines-learn', coursewareId: 'comic-courseware', coursewareSlug: 'four-panel-story-studio',
    entryUrl: 'https://agent.example.test/can-machines-learn/four-panel-story-studio/' };
  const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  const options = { dataDir, mediaDir, apiKey: 'fixture-only', platformBase: 'https://platform.example.test/api/v1',
    publicUrl: 'https://agent.example.test/can-machines-learn/four-panel-story-studio',
    loadMeta: async id => meta.get(id), saveMeta: async (id, value) => meta.set(id, value), mediaUrl: name => `/lesson/media/${name}`,
    recordGenerationStep: async () => {},
    fetchImpl: async (url, init = {}) => {
      if (url.includes('/launch/verify')) {
        const token = JSON.parse(init.body).launchToken;
        if (token === 'expired') return response({}, 401);
        if (state.verificationStatus !== 200) return response({}, state.verificationStatus);
        return response({ context: { student: { id: token === 'student-b' ? 'student-b' : state.student }, assignment: { id: state.assignment },
          courseware: { id: state.coursewareId, slug: state.coursewareSlug, entryUrl: state.entryUrl }, course: { slug: state.courseSlug } } });
      }
      if (url.startsWith('https://video.example.test/')) {
        if (state.downloadFails) throw new Error('temporary download interruption');
        return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]));
      }
      if (init.method === 'POST') {
        state.creates++; state.payloads.push(JSON.parse(init.body));
        if (state.networkError) throw new Error('connection lost after provider accepted');
        return response({ id: `provider-${state.creates}` }, state.submitStatus);
      }
      state.queries++;
      return response({ status: state.remoteStatus, duration: 10, usage: { completion_tokens: 216900 }, content: { video_url: 'https://video.example.test/result.mp4' } });
    },
  };
  const service = await createSeedanceVideoService(options);
  const req = (token = 'student-a') => ({ headers: { authorization: `Bearer ${token}` } });
  const body = (requestId = randomUUID()) => ({ requestId, audioId, comicId, bgmMood: 'soft', studentId: 'forged-client-id' });
  const complete = async (job, svc = service) => {
    await svc.status(req(), { requestId: job.requestId }); await svc.settleDownloads();
    return svc.status(req(), { requestId: job.requestId });
  };
  return { dataDir, mediaDir, options, service, state, req, body, complete, comicId };
}

test('same-student parallel requests reserve one slot and submit only once', async t => {
  const f = await fixture(t);
  const replies = await Promise.all(Array.from({ length: 8 }, () => f.service.start(f.req(), f.body())));
  assert.equal(f.state.creates, 1);
  assert.equal(new Set(replies.map(r => r.job.requestId)).size, 1);
  assert.equal(replies[0].quota.used, 1);
  assert.equal(replies[0].quota.remaining, 2);
  const same = await f.service.start(f.req('replacement-launch-token'), f.body(replies[0].job.requestId));
  assert.equal(same.job.requestId, replies[0].job.requestId);
  assert.equal(f.state.creates, 1);
  await assert.rejects(f.service.start(f.req(), { ...f.body(replies[0].job.requestId), comicId: randomUUID() }), { code: 'VIDEO_REQUEST_CONFLICT' });
});

test('three completed videos exhaust this student lesson across restarts and launch tokens', async t => {
  const f = await fixture(t);
  for (let index = 0; index < 3; index++) {
    const { job } = await f.service.start(f.req(), f.body());
    const result = await f.complete(job);
    assert.equal(result.job.status, 'succeeded');
    assert.equal(result.quota.used, index + 1);
    assert.match(result.job.result.videoUrl, /^\/lesson\/media\//);
  }
  assert.equal(f.state.creates, 3);
  const restarted = await createSeedanceVideoService(f.options);
  await assert.rejects(restarted.start(f.req('new-launch-token'), f.body()), { code: 'VIDEO_LIMIT_REACHED' });
  assert.equal((await restarted.quota(f.req())).remaining, 0);
  assert.equal((await restarted.quota(f.req('student-b'))).remaining, 3);
  f.state.assignment = 'another-lesson';
  assert.equal((await restarted.quota(f.req())).remaining, 3);
});

test('confirmed provider failure refunds reservation without re-submitting the same request', async t => {
  const f = await fixture(t); f.state.remoteStatus = 'failed';
  const { job } = await f.service.start(f.req(), f.body());
  const failed = await f.service.status(f.req(), { requestId: job.requestId });
  assert.equal(failed.job.status, 'failed'); assert.equal(failed.quota.remaining, 3);
  await f.service.start(f.req(), f.body(job.requestId)); assert.equal(f.state.creates, 1);
  f.state.remoteStatus = 'succeeded';
  const next = await f.service.start(f.req(), f.body()); await f.complete(next.job);
  assert.equal(f.state.creates, 2);
});

test('lost submission response stays reserved, survives restart, and is never retried automatically', async t => {
  const f = await fixture(t); f.state.networkError = true;
  const { job, quota } = await f.service.start(f.req(), f.body());
  assert.equal(job.status, 'unknown'); assert.equal(quota.used, 1);
  const restarted = await createSeedanceVideoService(f.options);
  const retry = await restarted.start(f.req(), f.body());
  assert.equal(retry.job.requestId, job.requestId); assert.equal(retry.job.status, 'unknown');
  assert.equal(f.state.creates, 1);
});

test('download interruption resumes original provider task and does not consume a second slot', async t => {
  const f = await fixture(t); f.state.downloadFails = true;
  const { job } = await f.service.start(f.req(), f.body());
  await f.service.status(f.req(), { requestId: job.requestId }); await f.service.settleDownloads();
  assert.equal((await f.service.status(f.req(), { requestId: job.requestId })).job.status, 'downloading');
  await f.service.settleDownloads(); f.state.downloadFails = false;
  const result = await f.complete(job);
  assert.equal(result.job.status, 'succeeded'); assert.equal(result.quota.used, 1); assert.equal(f.state.creates, 1);
});

test('formal identity is verified by server and cannot be replaced by request fields or demo flag', async t => {
  const f = await fixture(t);
  await assert.rejects(f.service.start({ headers: {} }, { ...f.body(), demo: true }), { code: 'LAUNCH_REQUIRED' });
  await assert.rejects(f.service.quota(f.req('expired')), { code: 'LAUNCH_INVALID' });
  f.state.coursewareSlug = 'unrelated-lesson';
  await assert.rejects(f.service.quota(f.req()), { code: 'LAUNCH_MISMATCH' });
  assert.equal(f.state.creates, 0);
  f.state.coursewareSlug = 'four-panel-story-studio';
  const { job } = await f.service.start(f.req(), f.body());
  await assert.rejects(f.service.status(f.req('student-b'), { requestId: job.requestId }), { code: 'VIDEO_NOT_FOUND' });
});

test('official request uses selected image, trusted storyboard, 10s/720p, and generated sound', async t => {
  const f = await fixture(t); await f.service.start(f.req(), { ...f.body(), panels: [{ visual: 'CLIENT OVERRIDE' }] });
  const sent = f.state.payloads[0];
  assert.equal(sent.model, 'doubao-seedance-2-0-fast-260128');
  assert.equal(sent.duration, 10); assert.equal(sent.resolution, '720p'); assert.equal(sent.generate_audio, true);
  assert.equal(sent.content[1].role, 'first_frame'); assert.match(sent.content[1].image_url.url, /^data:image\/jpeg;base64,/);
  assert.ok(!sent.content[0].text.includes('CLIENT OVERRIDE'));
  assert.match(videoPrompt({ panels: [{ visual: '回家' }] }, 'fast'), /轻快活泼/);
});

test('definitive submission rejection frees the slot while a server error stays uncertain', async t => {
  const f = await fixture(t); f.state.submitStatus = 403;
  const rejection = await f.service.start(f.req(), f.body());
  assert.equal(rejection.job.status, 'failed'); assert.equal(rejection.quota.remaining, 3);
  f.state.submitStatus = 503;
  const uncertain = await f.service.start(f.req(), f.body());
  assert.equal(uncertain.job.status, 'unknown'); assert.equal(uncertain.quota.remaining, 2);
});

test('partial comic retries keep current candidates and exclude another work from recovery', async t => {
  const f = await fixture(t);
  const selected = await f.options.loadMeta(f.comicId), valid = randomUUID(), unrelated = randomUUID();
  await f.options.saveMeta(valid, { ...selected, comicId: valid, styleIndex: 2 });
  await f.options.saveMeta(unrelated, { ...selected, comicId: unrelated, generationId: randomUUID() });
  const { job } = await f.service.start(f.req(), { ...f.body(), comicIds: [valid, unrelated] });
  assert.deepEqual(new Set(job.comics.map(comic => comic.comicId)), new Set([f.comicId, valid]));
  assert.ok(job.comics.every(comic => !('path' in comic) && !('prompt' in comic)));
  const restarted = await createSeedanceVideoService(f.options);
  await f.complete(job, restarted);
  assert.equal(f.state.creates, 1);
});

test('new teaching course can reference the verified original runtime without losing lesson quota', async t => {
  const f = await fixture(t); f.state.courseSlug = '11-16';
  assert.equal((await f.service.quota(f.req())).remaining, 3);
  const { job } = await f.service.start(f.req(), f.body());
  const result = await f.complete(job);
  assert.equal(result.quota.used, 1);
  f.state.assignment = 'next-classroom-task';
  assert.equal((await f.service.quota(f.req())).remaining, 3);
});

test('referenced course must still match the verified source path or configured courseware ID', async t => {
  const f = await fixture(t); f.state.courseSlug = '11-16';
  f.state.entryUrl = 'https://agent.example.test/unrelated-course/four-panel-story-studio/';
  await assert.rejects(f.service.quota(f.req()), { code: 'LAUNCH_MISMATCH' });
  f.state.entryUrl = 'https://other.example.test/can-machines-learn/four-panel-story-studio/';
  await assert.rejects(f.service.quota(f.req()), { code: 'LAUNCH_MISMATCH' });
  f.state.entryUrl = f.options.publicUrl + '/';
  const bound = await createSeedanceVideoService({ ...f.options, coursewareId: 'comic-courseware' });
  assert.equal((await bound.quota(f.req())).remaining, 3);
  f.state.coursewareId = 'another-courseware-with-the-same-slug';
  await assert.rejects(bound.quota(f.req()), { code: 'LAUNCH_MISMATCH' });
  assert.equal(f.state.creates, 0);
});

test('legacy HTTP source entry matches its HTTPS runtime while other hosts and ports remain rejected', async t => {
  const f = await fixture(t); f.state.courseSlug = '11-16';
  f.state.entryUrl = f.options.publicUrl.replace('https:', 'http:') + '/';
  assert.equal((await f.service.quota(f.req())).remaining, 3);
  f.state.entryUrl = 'http://other.example.test/can-machines-learn/four-panel-story-studio/';
  await assert.rejects(f.service.quota(f.req()), { code: 'LAUNCH_MISMATCH' });
  f.state.entryUrl = 'http://agent.example.test:4103/can-machines-learn/four-panel-story-studio/';
  await assert.rejects(f.service.quota(f.req()), { code: 'LAUNCH_MISMATCH' });
  assert.equal(f.state.creates, 0);
});

test('temporary platform failure remains retryable and does not consume video quota', async t => {
  const f = await fixture(t); f.state.verificationStatus = 503;
  await assert.rejects(f.service.quota(f.req()), { code: 'PLATFORM_UNAVAILABLE', statusCode: 503, retryable: true });
  f.state.verificationStatus = 200;
  assert.equal((await f.service.quota(f.req())).remaining, 3);
  assert.equal(f.state.creates, 0);
});
