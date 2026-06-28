import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
loadLocalEnv(join(rootDir, '.env.local'));
loadLocalEnv(join(rootDir, '.env'));
const staticDir = join(rootDir, 'static');
const dataDir = resolve(process.env.COURSEWARE_DATA_DIR || join(os.tmpdir(), 'four-panel-story-studio'));
const mediaDir = join(dataDir, 'media');
const metaDir = join(dataDir, 'meta');
const port = Number(process.env.PORT || 4184);
const host = process.env.HOST || '127.0.0.1';
const arkTextModel = process.env.ARK_TEXT_MODEL || 'doubao-seed-2-1-turbo-260628';
const arkImageModel = process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5-0-260128';
const arkImageSize = process.env.ARK_IMAGE_SIZE || '2K';
const arkBaseUrl = 'https://ark.cn-beijing.volces.com/api/v3';
const remoteRequestTimeoutMs = Number(process.env.COURSEWARE_REMOTE_TIMEOUT_MS || 45000);
const imageGenerationTimeoutMs = Number(process.env.COURSEWARE_IMAGE_TIMEOUT_MS || 300000);
const imageDownloadTimeoutMs = Number(process.env.COURSEWARE_IMAGE_DOWNLOAD_TIMEOUT_MS || 90000);
const comicGenerationConcurrency = readBoundedInteger(process.env.COURSEWARE_COMIC_CONCURRENCY, 4, 1, 4);
const defaultAsrResourceIds = ['volc.seedasr.auc', 'volc.bigasr.auc'];
const defaultFont = resolveDefaultFont(process.env.COURSEWARE_FONT_FILE);
const panelStructures = ['起', '承', '转', '合'];
const comicStylePresets = [
  {
    key: 'ink',
    label: '新中式水墨风格',
    prompt:
      '新中式水墨漫画，手绘宣纸质感，淡墨线条，留白充足，浅彩点染，清雅温暖，圆润儿童角色，课堂友好。',
    palette: '米白宣纸底、淡墨灰、竹青、浅湖蓝、少量暖黄色点缀，整体低饱和。',
  },
  {
    key: 'guochao',
    label: '新中式国潮风格',
    prompt:
      '新中式国潮漫画，传统纹样与现代儿童插画结合，线条清楚，色块明快，祥云、山水、窗格等中式元素轻量点缀，可爱但不浮夸。',
    palette: '米白、朱砂红、孔雀蓝、竹青、暖金色点缀，明亮但不过度饱和。',
  },
  {
    key: 'gongbi',
    label: '新中式工笔淡彩风格',
    prompt:
      '新中式工笔淡彩漫画，细腻干净的手绘线稿，柔和设色，植物、云、水纹等细节精致，画面安静、有秩序，儿童角色温和可亲。',
    palette: '米白、淡青、浅绿、藕粉、暖黄，色彩清淡通透。',
  },
  {
    key: 'qcute',
    label: '新中式Q版可爱风格',
    prompt:
      '新中式Q版可爱漫画，圆头圆脸、短身比例、表情清楚，中式小物件和场景装饰轻量融入，活泼、亲切、适合小学生。',
    palette: '奶油白、浅竹绿、天空蓝、橘黄、少量朱砂红，明快柔和。',
  },
];
let ffmpegFiltersCache = null;

function resolveDefaultFont(configuredFont) {
  const candidates = [
    configuredFont,
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Light.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || candidates[candidates.length - 1];
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.webm': 'audio/webm',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

await mkdir(mediaDir, { recursive: true });
await mkdir(metaDir, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const url = runtimeUrl(new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`));
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        asrConfigured: getAsrAuthMode() !== 'missing',
        asrAuthMode: getAsrAuthMode(),
        asrResourceIds: getAsrResourceIds(),
        arkConfigured: Boolean(process.env.ARK_API_KEY),
        arkKeyLooksValid: isValidArkApiKey(process.env.ARK_API_KEY),
        publicBaseUrlConfigured: Boolean(configuredPublicBaseUrl() || configuredCoursewarePublicUrl()),
        ffmpegAvailable: await commandExists('ffmpeg'),
        drawTextAvailable: await hasFfmpegFilter('drawtext'),
        timeoutMs: {
          remote: remoteRequestTimeoutMs,
          imageGeneration: imageGenerationTimeoutMs,
          imageDownload: imageDownloadTimeoutMs,
          comicGenerationConcurrency,
        },
      });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/projector/work/')) {
      return await getProjectorWork(res, url);
    }

    if (req.method === 'GET' && url.pathname.startsWith('/projector/')) {
      return await serveProjector(req, res, url);
    }

    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }

    if (url.pathname.startsWith('/media/')) {
      return await serveMedia(req, res, url);
    }

    return await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { message: safeMessage(error) });
  }
});

server.listen(port, host, () => {
  console.log(`AI 四格故事工坊 listening on http://${host}:${port}`);
});

async function handleApi(req, res, url) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { message: 'Method not allowed' });
  }

  const body = await readJsonBody(req);
  if (url.pathname === '/api/audio/upload') return uploadAudio(res, body);
  if (url.pathname === '/api/asr/transcribe') return transcribeAudio(res, body);
  if (url.pathname === '/api/story/generate') return generateStory(res, body);
  if (url.pathname === '/api/comics/generate') return generateComics(res, body);
  if (url.pathname === '/api/video/render') return renderVideo(res, body);
  if (url.pathname === '/api/projector/save') return saveProjectorWork(req, res, body);
  return sendJson(res, 404, { message: 'Unknown API route' });
}

async function uploadAudio(res, body) {
  const audioId = randomUUID();
  const mimeType = String(body.mimeType || 'audio/webm');
  const sourceExt = extensionForMime(mimeType) || '.webm';
  const sourcePath = join(mediaDir, `${audioId}${sourceExt}`);
  const mp3Path = join(mediaDir, `${audioId}.mp3`);
  const buffer = decodeDataUrlOrBase64(body.contentBase64 || body.dataUrl);

  if (!buffer || buffer.length < 128) {
    return sendJson(res, 400, { message: '录音文件为空，请重新录音。' });
  }

  await writeFile(sourcePath, buffer);
  await runFfmpeg([
    '-y',
    '-i',
    sourcePath,
    '-vn',
    '-ar',
    '16000',
    '-ac',
    '1',
    '-codec:a',
    'libmp3lame',
    '-b:a',
    '64k',
    mp3Path,
  ]);

  const durationSeconds = await probeDuration(mp3Path).catch(() => null);
  await saveMeta(audioId, {
    id: audioId,
    kind: 'audio',
    sourcePath,
    path: mp3Path,
    mimeType: 'audio/mpeg',
    originalMimeType: mimeType,
    createdAt: new Date().toISOString(),
    durationSeconds,
  });

  return sendJson(res, 200, {
    audioId,
    audioUrl: mediaUrl(`${audioId}.mp3`),
    mimeType: 'audio/mpeg',
    durationSeconds,
  });
}

async function transcribeAudio(res, body) {
  if (body.demo) {
    return sendJson(res, 200, {
      text: demoTranscript(),
      taskId: `demo-${randomUUID()}`,
      status: 'demo',
    });
  }

  const missingEnv = [];
  if (getAsrAuthMode() === 'missing') missingEnv.push('VOLC_ASR_API_KEY');
  if (!configuredPublicBaseUrl() && !configuredCoursewarePublicUrl()) {
    missingEnv.push('COURSEWARE_PUBLIC_BASE_URL 或 COURSEWARE_PUBLIC_URL');
  }
  if (missingEnv.length) {
    return sendJson(res, 503, {
      code: 'ASR_CONFIG_MISSING',
      message: `语音识别服务未配置：缺少 ${missingEnv.join('、')}。新版豆包语音只需要配置 VOLC_ASR_API_KEY；旧版 App ID / Access Token 默认不会启用。录音已保存，可以配置后重新录音，或先使用示例故事测试后续流程。`,
    });
  }

  const audio = await loadMeta(String(body.audioId || ''));
  if (!audio || audio.kind !== 'audio') {
    return sendJson(res, 404, { message: '找不到录音，请重新上传。' });
  }

  const audioUrl = absoluteMediaUrl(`${audio.id}.mp3`);
  if (isLocalPublicBaseUrl(audioUrl)) {
    return sendJson(res, 503, {
      code: 'ASR_PUBLIC_BASE_URL_LOCAL',
      message:
        '语音识别服务无法访问 localhost 地址。请把 COURSEWARE_PUBLIC_BASE_URL 设置为火山云端可访问的公网地址，比如部署域名或临时隧道地址。',
    });
  }

  const submitBody = {
    user: { uid: 'four-panel-story-studio' },
    audio: {
      format: 'mp3',
      url: audioUrl,
      language: 'zh-CN',
    },
    request: {
      model_name: 'bigmodel',
      enable_itn: true,
      enable_punc: true,
      enable_ddc: true,
      show_utterances: true,
    },
  };

  let lastSubmitError = null;
  for (const resourceId of getAsrResourceIds()) {
    const taskId = randomUUID();
    const submitHeaders = createAsrHeaders(taskId, { includeSequence: true, resourceId });
    const submit = await fetchText('https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit', {
      method: 'POST',
      headers: submitHeaders,
      body: JSON.stringify(submitBody),
    });
    const submitStatus = submit.headers.get('x-api-status-code');
    const submitMessage = submit.headers.get('x-api-message') || submit.text || submitStatus;
    if (submitStatus !== '20000000') {
      lastSubmitError = {
        message: submitMessage,
        statusCode: submitStatus,
        logId: submit.headers.get('x-tt-logid'),
        resourceId,
      };
      if (isAsrResourceNotGranted(submitMessage)) continue;
      return sendJson(res, 502, {
        code: 'ASR_SUBMIT_FAILED',
        message: formatAsrSubmitError(submitMessage, resourceId),
        statusCode: submitStatus,
        logId: submit.headers.get('x-tt-logid'),
        resourceId,
      });
    }

    const queryHeaders = createAsrHeaders(taskId, { includeSequence: false, resourceId });
    let lastResult = null;
    for (let index = 0; index < 18; index += 1) {
      await wait(index === 0 ? 1200 : 1800);
      const query = await fetchText('https://openspeech.bytedance.com/api/v3/auc/bigmodel/query', {
        method: 'POST',
        headers: queryHeaders,
        body: '{}',
      });
      const statusCode = query.headers.get('x-api-status-code');
      lastResult = { statusCode, message: query.headers.get('x-api-message'), text: query.text };
      if (statusCode === '20000000') {
        const parsed = tryJson(query.text);
        const text = parsed?.result?.text || '';
        await saveMeta(audio.id, { ...audio, transcript: text, asrTaskId: taskId, asrResourceId: resourceId });
        return sendJson(res, 200, {
          text,
          taskId,
          resourceId,
          utterances: parsed?.result?.utterances || [],
          durationSeconds: parsed?.audio_info?.duration ? parsed.audio_info.duration / 1000 : audio.durationSeconds,
        });
      }
      if (isAsrAudioDownloadFailed(lastResult.message) || isAsrAudioDownloadFailed(lastResult.text)) {
        return sendJson(res, 502, {
          code: 'ASR_AUDIO_DOWNLOAD_FAILED',
          message:
            '语音识别无法下载录音文件。请检查 COURSEWARE_PUBLIC_BASE_URL 是否是当前可访问的公网地址，临时隧道是否仍在运行，并确认 /media 录音链接可以从公网打开。',
          statusCode,
          resourceId,
        });
      }
      if (statusCode !== '20000001' && statusCode !== '20000002') break;
    }

    return sendJson(res, 504, {
      message: `火山 ASR 查询未完成：${lastResult?.message || 'unknown'}`,
      statusCode: lastResult?.statusCode || null,
      resourceId,
    });
  }

  return sendJson(res, 502, {
    code: 'ASR_RESOURCE_NOT_GRANTED',
    message: `当前豆包语音 API Key 没有开通可用的录音文件识别资源。已尝试：${getAsrResourceIds().join('、')}。请在豆包语音控制台开通“录音文件识别”或“录音文件识别2.0”。`,
    statusCode: lastSubmitError?.statusCode || null,
    resourceId: lastSubmitError?.resourceId || null,
  });
}

function getModernAsrApiKey() {
  return process.env.VOLC_ASR_API_KEY || process.env.VOLC_SPEECH_API_KEY || '';
}

function hasModernAsrCredentials() {
  return Boolean(getModernAsrApiKey());
}

function hasLegacyAsrCredentials() {
  return Boolean(process.env.VOLC_ASR_APP_ID && process.env.VOLC_ASR_ACCESS_TOKEN);
}

function getAsrAuthMode() {
  if (hasModernAsrCredentials()) return 'api-key';
  if (process.env.VOLC_ASR_USE_LEGACY === '1' && hasLegacyAsrCredentials()) return 'legacy';
  return 'missing';
}

function getAsrResourceIds() {
  const configured = process.env.VOLC_ASR_RESOURCE_ID || process.env.VOLC_ASR_RESOURCE_IDS || '';
  const ids = configured
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return ids.length ? ids : defaultAsrResourceIds;
}

function createAsrHeaders(taskId, { includeSequence, resourceId }) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Resource-Id': resourceId,
    'X-Api-Request-Id': taskId,
  };
  const apiKey = getModernAsrApiKey();
  if (getAsrAuthMode() === 'api-key') {
    headers['X-Api-Key'] = apiKey;
  } else if (getAsrAuthMode() === 'legacy') {
    headers['X-Api-App-Key'] = process.env.VOLC_ASR_APP_ID;
    headers['X-Api-Access-Key'] = process.env.VOLC_ASR_ACCESS_TOKEN;
  } else {
    throw new Error('ASR credentials are missing.');
  }
  if (includeSequence) headers['X-Api-Sequence'] = '-1';
  return headers;
}

function isAsrResourceNotGranted(message) {
  return /resource.*not granted/i.test(String(message || ''));
}

function isAsrAudioDownloadFailed(message) {
  return /invalid audio uri|audio download failed|download.*audio/i.test(String(message || ''));
}

function formatAsrSubmitError(message, resourceId) {
  if (isAsrResourceNotGranted(message)) {
    return `当前豆包语音 API Key 未开通 ${resourceId} 对应的录音文件识别资源，请在控制台开通对应模型，或设置 VOLC_ASR_RESOURCE_ID 为已开通的资源 ID。`;
  }
  return `火山 ASR 提交失败：${message}`;
}

async function generateStory(res, body) {
  const sourceText = String(body.text || '').trim();
  if (body.demo) {
    return sendJson(res, 200, createDemoStory(sourceText || demoTranscript()));
  }
  const arkConfigError = getArkConfigError();
  if (arkConfigError) return sendJson(res, 503, arkConfigError);
  if (!sourceText) return sendJson(res, 400, { message: '请先确认故事文本。' });

  const prompt = `你是小学课堂的四格漫画编剧。请把学生的口语故事整理成 4 套候选四格漫画脚本。
要求：
- 面向 6-12 岁儿童，温暖、清晰、正向。
- 每套必须有 title、theme、keywords、panels 四格。
- 四格必须严格对应起承转合：
  1. 起：介绍主角、地点、愿望或故事开端。
  2. 承：故事推进，伙伴行动或新发现。
  3. 转：困难、冲突、意外或关键选择。
  4. 合：解决问题，收束故事，留下积极感受。
- 每格包含 structure、caption、visual、emotion、voiceLine。
- structure 必须依次为 "起"、"承"、"转"、"合"。
- caption 不要重复写“起/承/转/合”，只写短标题。
- 输出严格 JSON，不要 Markdown。
- JSON 结构：{"candidates":[{"id":"story-1","title":"","theme":"","keywords":[""],"panels":[{"index":1,"structure":"起","caption":"","visual":"","emotion":"","voiceLine":""}]}]}

学生原始表达：
${sourceText}`;

  const completion = await fetchJson(`${arkBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model: arkTextModel,
      messages: [
        { role: 'system', content: '你只输出可以被 JSON.parse 解析的中文 JSON。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.6,
      max_tokens: 3000,
      thinking: { type: 'disabled' },
    }),
  });

  const content = completion?.choices?.[0]?.message?.content || '';
  const parsed = normalizeStoryResponse(extractJson(content), sourceText);
  return sendJson(res, 200, parsed);
}

async function generateComics(res, body) {
  const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 4) : [];
  if (!candidates.length) return sendJson(res, 400, { message: '缺少四格故事候选。' });
  if (body.demo) {
    const comics = await Promise.all(candidates.map((candidate, index) => createDemoComic(candidate, index)));
    return sendJson(res, 200, { comics });
  }
  const arkConfigError = getArkConfigError();
  if (arkConfigError) return sendJson(res, 503, arkConfigError);

  const comics = await mapWithConcurrency(candidates, comicGenerationConcurrency, generateComicCandidate);
  return sendJson(res, 200, { comics });
}

async function generateComicCandidate(candidate, index) {
  const comicId = randomUUID();
  const imagePath = join(mediaDir, `${comicId}.jpg`);
  const style = comicStyleForIndex(index);
  const prompt = buildComicPrompt(candidate, index);
  let imageResponse;
  try {
    imageResponse = await fetchJson(`${arkBaseUrl}/images/generations`, {
      method: 'POST',
      timeoutMs: imageGenerationTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ARK_API_KEY}`,
      },
      body: JSON.stringify({
        model: arkImageModel,
        prompt,
        response_format: 'url',
        size: arkImageSize,
        watermark: false,
        sequential_image_generation: 'disabled',
      }),
    });
  } catch (error) {
    if (isRemoteTimeoutError(error)) {
      throw new Error(`第 ${index + 1} 套漫画生成超时。Seedream 生图有时会超过 ${Math.round(imageGenerationTimeoutMs / 1000)} 秒，请稍后重试。`);
    }
    throw new Error(`第 ${index + 1} 套漫画生成失败：${error.message || error}`);
  }
  const remoteUrl = imageResponse?.data?.[0]?.url;
  if (!remoteUrl) throw new Error(`第 ${index + 1} 套漫画没有返回图片 URL。`);
  await downloadFile(remoteUrl, imagePath, imageDownloadTimeoutMs);
  const comic = {
    comicId,
    candidateId: candidate.id || `story-${index + 1}`,
    title: candidate.title || `故事候选 ${index + 1}`,
    imageUrl: mediaUrl(`${comicId}.jpg`),
    mimeType: 'image/jpeg',
    styleKey: style.key,
    styleLabel: style.label,
    panels: normalizePanels(candidate.panels),
    prompt,
    createdAt: new Date().toISOString(),
  };
  await saveMeta(comicId, { ...comic, kind: 'comic', path: imagePath });
  return comic;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  if (concurrency >= items.length) return Promise.all(items.map((item, index) => mapper(item, index)));
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

async function renderVideo(res, body) {
  const audio = await loadMeta(String(body.audioId || ''));
  const comic = await loadMeta(String(body.comicId || ''));
  if (!audio || audio.kind !== 'audio') return sendJson(res, 404, { message: '找不到学生录音。' });
  if (!comic || comic.kind !== 'comic') return sendJson(res, 404, { message: '找不到选中的漫画。' });

  const videoId = randomUUID();
  const workDir = join(dataDir, `render-${videoId}`);
  const outputPath = join(mediaDir, `${videoId}.mp4`);
  await mkdir(workDir, { recursive: true });

  const panels = normalizePanels(body.panels || comic.panels);
  const duration = Math.max(12, Math.min(32, Number(audio.durationSeconds) || 20));
  const segmentDuration = duration / 4;
  const bgmMood = normalizeBgmMood(body.bgmMood);
  const canBurnCaptions = await hasFfmpegFilter('drawtext');
  const panelPaths = await splitComicIntoPanels(comic.path, workDir);
  const segmentPaths = [];
  for (let index = 0; index < 4; index += 1) {
    const segmentPath = join(workDir, `segment-${index}.mp4`);
    await createSegment(
      panelPaths[index],
      getPanelCaption(panels[index] || { index: index + 1, caption: `第 ${index + 1} 格` }),
      segmentDuration,
      segmentPath,
      index,
      canBurnCaptions,
    );
    segmentPaths.push(segmentPath);
  }

  const concatPath = join(workDir, 'segments.txt');
  await writeFile(concatPath, segmentPaths.map((item) => `file '${item.replaceAll("'", "'\\''")}'`).join('\n'));
  const silentVideoPath = join(workDir, 'silent.mp4');
  await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', silentVideoPath]);
  const captionsPath = join(mediaDir, `${videoId}.vtt`);
  await writePanelCaptions(captionsPath, panels, segmentDuration, 'vtt');
  const bgmPath = join(workDir, `${bgmMood}-bgm.wav`);
  await createBackgroundMusic(bgmMood, duration, bgmPath);
  const finalArgs = [
    '-y',
    '-i',
    silentVideoPath,
    '-i',
    audio.path,
    '-i',
    bgmPath,
  ];
  if (!canBurnCaptions) {
    const subtitlesPath = join(workDir, 'captions.srt');
    await writePanelSubtitles(subtitlesPath, panels, segmentDuration);
    finalArgs.push('-i', subtitlesPath);
  }
  finalArgs.push(
    '-filter_complex',
    `[1:a]volume=1.0,apad,atrim=0:${duration.toFixed(3)}[voice];` +
      `[2:a]volume=${bgmMood === 'fast' ? '0.16' : '0.13'},apad,atrim=0:${duration.toFixed(3)}[bgm];` +
      `[voice][bgm]amix=inputs=2:duration=longest:dropout_transition=1.5[aout]`,
  );
  finalArgs.push(
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
  );
  if (!canBurnCaptions) {
    finalArgs.push('-map', '3:0');
  }
  finalArgs.push(
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
  );
  if (!canBurnCaptions) {
    finalArgs.push('-c:s', 'mov_text', '-metadata:s:s:0', 'language=chi', '-disposition:s:0', 'default');
  }
  finalArgs.push(
    '-movflags',
    '+faststart',
    '-t',
    String(duration),
    outputPath,
  );
  await runFfmpeg(finalArgs);

  const finalDuration = await probeDuration(outputPath).catch(() => duration);
  const meta = {
    id: videoId,
    kind: 'video',
    path: outputPath,
    mimeType: 'video/mp4',
    videoUrl: mediaUrl(`${videoId}.mp4`),
    captionsUrl: mediaUrl(`${videoId}.vtt`),
    comicId: comic.id || comic.comicId,
    audioId: audio.id,
    title: body.title || comic.title || '我的四格故事视频',
    panels,
    bgmMood,
    durationSeconds: finalDuration,
    createdAt: new Date().toISOString(),
  };
  await saveMeta(videoId, meta);
  return sendJson(res, 200, {
    videoId,
    videoUrl: meta.videoUrl,
    captionsUrl: meta.captionsUrl,
    mimeType: meta.mimeType,
    durationSeconds: meta.durationSeconds,
    bgmMood,
  });
}

async function saveProjectorWork(req, res, body) {
  const audio = await loadMeta(String(body.audioId || ''));
  if (!audio || audio.kind !== 'audio') return sendJson(res, 404, { message: '找不到学生录音。' });

  const videoId = String(body.videoId || body.video?.videoId || '');
  const video = await loadMeta(videoId);
  if (!video || video.kind !== 'video') return sendJson(res, 404, { message: '请先合成视频，再生成投屏页。' });

  const inputComics = Array.isArray(body.comics) ? body.comics.slice(0, 4) : [];
  const comics = [];
  for (const item of inputComics) {
    const comic = await loadMeta(String(item?.comicId || ''));
    if (comic?.kind === 'comic') {
      comics.push({
        comicId: comic.comicId || comic.id,
        title: comic.title || item.title || '四格漫画',
        imageUrl: comic.imageUrl || item.imageUrl,
        mimeType: comic.mimeType || item.mimeType || 'image/jpeg',
        styleKey: comic.styleKey || item.styleKey || '',
        styleLabel: comic.styleLabel || item.styleLabel || '',
        panels: normalizePanels(comic.panels || item.panels),
      });
    }
  }
  if (!comics.length) return sendJson(res, 400, { message: '缺少漫画候选，无法生成投屏页。' });

  const selectedComicId = String(body.selectedComicId || body.selectedComic?.comicId || '');
  const selectedComic = comics.find((comic) => comic.comicId === selectedComicId) || comics[0];
  const workId = randomUUID();
  const title = String(body.title || selectedComic.title || video.title || '四格故事放映会').slice(0, 40);
  const work = {
    id: workId,
    kind: 'projector-work',
    title,
    transcript: String(body.transcript || audio.transcript || '').slice(0, 240),
    audio: {
      audioId: audio.id,
      url: mediaUrl(`${audio.id}.mp3`),
      mimeType: audio.mimeType || 'audio/mpeg',
      durationSeconds: audio.durationSeconds || null,
    },
    comics,
    selectedComicId: selectedComic.comicId,
    selectedComic,
    video: {
      videoId: video.id,
      title: video.title || `${title} 视频`,
      url: video.videoUrl || mediaUrl(`${video.id}.mp4`),
      captionsUrl: video.captionsUrl || '',
      mimeType: video.mimeType || 'video/mp4',
      durationSeconds: video.durationSeconds || null,
      bgmMood: video.bgmMood || normalizeBgmMood(body.bgmMood),
    },
    bgmMood: video.bgmMood || normalizeBgmMood(body.bgmMood),
    createdAt: new Date().toISOString(),
  };
  await saveMeta(workId, work);
  const projectorUrl = absoluteUrl(req, `/projector/${workId}`);
  return sendJson(res, 200, { workId, projectorUrl, screenUrl: projectorUrl });
}

async function getProjectorWork(res, url) {
  const workId = decodeURIComponent(url.pathname.replace(/^\/api\/projector\/work\//, ''));
  const work = await loadMeta(workId);
  if (!work || work.kind !== 'projector-work') return sendNotFound(res);
  return sendJson(res, 200, work);
}

async function serveProjector(req, res, url) {
  const workId = decodeURIComponent(url.pathname.replace(/^\/projector\//, ''));
  const work = await loadMeta(workId);
  if (!work || work.kind !== 'projector-work') return sendNotFound(res);
  const html = renderProjectorHtml(work);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

function renderProjectorHtml(work) {
  const selected = work.selectedComic || work.comics?.[0] || {};
  const comics = Array.isArray(work.comics) ? work.comics.slice(0, 4) : [];
  const video = work.video || {};
  const audio = work.audio || {};
  const transcript = String(work.transcript || '').trim();
  const comicCards = comics
    .map((comic, index) => {
      const isSelected = comic.comicId === work.selectedComicId;
      return `
        <figure class="show-card comic-card${isSelected ? ' is-selected' : ''}">
          <div class="card-kicker">候选 ${index + 1}${comic.styleLabel ? ` · ${escapeXml(comic.styleLabel)}` : ''}</div>
          <img src="${escapeXml(comic.imageUrl || '')}" alt="${escapeXml(comic.title || `候选 ${index + 1}`)}" />
          <figcaption>
            <span>${escapeXml(comic.title || `候选 ${index + 1}`)}</span>
            ${isSelected ? '<b>已选</b>' : ''}
          </figcaption>
        </figure>
      `;
    })
    .join('');
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeXml(work.title || '四格故事投屏')}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #172421;
        --paper: #fff8e8;
        --panel: #fffdf5;
        --green: #39a477;
        --blue: #82ccf0;
        --yellow: #ffd96e;
        --coral: #f47d55;
        --shadow: 0 12px 0 rgba(23, 36, 33, 0.12);
      }

      * { box-sizing: border-box; }

      html,
      body {
        margin: 0;
        min-height: 100%;
      }

      body {
        min-height: 100vh;
        overflow-x: hidden;
        overflow-y: auto;
        color: var(--ink);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        background:
          radial-gradient(circle at 18px 18px, rgba(23, 36, 33, 0.09) 0 2px, transparent 2.5px),
          linear-gradient(135deg, rgba(130, 204, 240, 0.22), transparent 36%),
          #fff0dc;
        background-size: 34px 34px, 100% 100%, auto;
      }

      .screen {
        position: relative;
        width: min(1480px, calc(100vw - 48px));
        min-height: calc(100vh - 48px);
        margin: 24px auto 42px;
        padding: 26px;
        overflow: visible;
        border: 6px solid var(--ink);
        border-radius: 28px;
        background: var(--paper);
        box-shadow: 0 18px 0 rgba(23, 36, 33, 0.14);
      }

      .screen::before,
      .screen::after {
        content: "";
        position: absolute;
        width: 12%;
        height: 11%;
        pointer-events: none;
        background:
          linear-gradient(28deg, transparent 48%, rgba(23, 36, 33, 0.36) 49% 51%, transparent 52%),
          linear-gradient(45deg, transparent 48%, rgba(23, 36, 33, 0.24) 49% 51%, transparent 52%);
        background-repeat: no-repeat;
        background-size: 82% 48%;
        opacity: 0.62;
      }

      .screen::before {
        top: 32px;
        left: 22%;
      }

      .screen::after {
        right: 32px;
        bottom: 28px;
        transform: rotate(180deg);
      }

      .content {
        position: relative;
        z-index: 1;
        display: grid;
        gap: 24px;
      }

      header {
        display: grid;
        grid-template-columns: 180px minmax(0, 1fr) 180px;
        gap: 18px;
        align-items: center;
      }

      .label,
      .meta-pill {
        display: inline-grid;
        min-height: 54px;
        place-items: center;
        border: 4px solid var(--ink);
        border-radius: 999px;
        background: var(--yellow);
        font-size: clamp(16px, 1.4vw, 24px);
        font-weight: 950;
        box-shadow: 0 5px 0 rgba(23, 36, 33, 0.14);
      }

      .meta-pill {
        background: #e2f7ef;
      }

      h1 {
        margin: 0;
        text-align: center;
        font-size: clamp(40px, 5vw, 86px);
        line-height: 1;
        letter-spacing: 0;
        font-weight: 950;
      }

      .feature-card,
      .show-card {
        border: 4px solid var(--ink);
        border-radius: 20px;
        background: rgba(255, 253, 245, 0.94);
        box-shadow: var(--shadow);
      }

      .feature-card h2,
      .show-card h2 {
        margin: 0;
        padding: 16px 22px;
        border-bottom: 4px solid var(--ink);
        border-radius: 16px 16px 0 0;
        background: #e8f7f2;
        font-size: clamp(22px, 2vw, 34px);
        line-height: 1;
        font-weight: 950;
      }

      .video-card h2 {
        background: #dff2ff;
      }

      .video-stage {
        padding: 18px;
      }

      video {
        display: block;
        width: 100%;
        height: clamp(420px, 58vh, 720px);
        border: 4px solid var(--ink);
        border-radius: 18px;
        background: #152320;
        object-fit: contain;
      }

      .waterfall {
        column-count: 2;
        column-gap: 24px;
      }

      .show-card {
        display: block;
        width: 100%;
        margin: 0 0 24px;
        break-inside: avoid;
        overflow: hidden;
      }

      .audio-card h2 {
        background: #ffdcca;
      }

      .selected-card h2 {
        background: var(--yellow);
      }

      .section-note {
        margin: 0;
        padding: 16px 22px 0;
        color: #52645f;
        font-size: clamp(15px, 1.2vw, 19px);
        font-weight: 850;
        line-height: 1.45;
      }

      .media-pad {
        padding: 18px;
      }

      .selected-card img,
      .comic-card img {
        display: block;
        width: 100%;
        height: auto;
        border: 3px solid rgba(23, 36, 33, 0.3);
        border-radius: 16px;
        background: #fff3dc;
      }

      audio {
        width: 100%;
        margin: 0 0 16px;
      }

      .transcript {
        margin: 0;
        color: #51635d;
        font-size: clamp(16px, 1.2vw, 22px);
        line-height: 1.45;
        font-weight: 800;
      }

      .comic-card {
        position: relative;
        padding: 18px;
        border: 3px solid rgba(23, 36, 33, 0.32);
        border-radius: 16px;
        background: #fff9ee;
      }

      .comic-card.is-selected {
        border-color: var(--ink);
        background: #ecfff6;
        box-shadow: inset 0 0 0 5px rgba(57, 164, 119, 0.24);
      }

      .card-kicker {
        display: inline-grid;
        min-height: 34px;
        margin-bottom: 12px;
        padding: 0 14px;
        place-items: center;
        border: 3px solid var(--ink);
        border-radius: 999px;
        background: #e7f7ef;
        font-size: 16px;
        font-weight: 950;
      }

      figcaption {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
        margin-top: 14px;
        font-size: clamp(18px, 1.4vw, 28px);
        font-weight: 950;
        line-height: 1.1;
      }

      figcaption span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      figcaption b {
        flex: 0 0 auto;
        padding: 0.25em 0.55em;
        border: 2px solid var(--ink);
        border-radius: 999px;
        color: #fff;
        background: var(--green);
        font-size: 0.86em;
      }

      @media (max-width: 980px) {
        .screen {
          width: min(100vw - 20px, 1480px);
          margin: 10px auto 24px;
          padding: 16px;
        }

        header {
          grid-template-columns: 1fr;
        }

        h1 {
          font-size: 42px;
        }

        .waterfall {
          column-count: 1;
        }

        video {
          height: 46vh;
        }
      }
    </style>
  </head>
  <body>
    <main class="screen" aria-label="AI 四格故事工坊投屏页">
      <div class="content">
        <header>
          <span class="label">故事放映会</span>
          <h1>${escapeXml(work.title || selected.title || '四格故事')}</h1>
          <span class="meta-pill">${escapeXml(video.bgmMood === 'fast' ? '轻快配乐' : '柔和配乐')}</span>
        </header>

        <section class="feature-card video-card">
            <h2>视频播放</h2>
            <div class="video-stage">
            <video controls playsinline preload="metadata" poster="${escapeXml(selected.imageUrl || '')}">
              <source src="${escapeXml(video.url || '')}" type="${escapeXml(video.mimeType || 'video/mp4')}" />
              ${video.captionsUrl ? `<track kind="subtitles" label="故事字幕" srclang="zh" src="${escapeXml(video.captionsUrl)}" default />` : ''}
            </video>
            </div>
        </section>

        <section class="waterfall" aria-label="作品瀑布流">
          <section class="show-card audio-card">
            <h2>学生原声</h2>
            <div class="media-pad">
            <audio controls preload="metadata" src="${escapeXml(audio.url || '')}"></audio>
            <p class="transcript">${escapeXml(transcript || '学生录音已保存，可以在这里播放原声。')}</p>
            </div>
          </section>

          <figure class="show-card selected-card">
            <h2>已选漫画</h2>
            <div class="media-pad">
              <img src="${escapeXml(selected.imageUrl || '')}" alt="${escapeXml(selected.title || '已选漫画')}" />
              <figcaption>
                <span>${escapeXml(selected.title || work.title || '四格故事')}</span>
                <b>${escapeXml(selected.styleLabel ? `已选 · ${selected.styleLabel}` : '已选')}</b>
              </figcaption>
            </div>
          </figure>

          <section class="show-card">
            <h2>四套候选漫画</h2>
            <p class="section-note">下面保留学生生成时看到的 4 套原始候选，方便老师比较故事表达和画面选择。</p>
          </section>

          ${comicCards}
        </section>
      </div>
    </main>
  </body>
</html>`;
}

function absoluteUrl(req, pathname) {
  const coursewarePublicUrl = configuredCoursewarePublicUrl();
  if (coursewarePublicUrl) return `${coursewarePublicUrl}${pathname}`;
  const publicBaseUrl = configuredPublicBaseUrl();
  if (publicBaseUrl) return `${publicBaseUrl}${runtimePath(pathname)}`;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || 'http';
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const hostHeader = forwardedHost || req.headers.host || `${host}:${port}`;
  return `${proto}://${hostHeader}${pathname}`;
}

async function splitComicIntoPanels(imagePath, workDir) {
  const crops = [
    ['0', '0'],
    ['iw/2', '0'],
    ['0', 'ih/2'],
    ['iw/2', 'ih/2'],
  ];
  const panelPaths = [];
  for (let index = 0; index < crops.length; index += 1) {
    const panelPath = join(workDir, `panel-${index}.jpg`);
    await runFfmpeg([
      '-y',
      '-i',
      imagePath,
      '-vf',
      `crop=iw/2:ih/2:${crops[index][0]}:${crops[index][1]},scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xFFF9F0`,
      '-frames:v',
      '1',
      panelPath,
    ]);
    panelPaths.push(panelPath);
  }
  return panelPaths;
}

async function createSegment(panelPath, caption, duration, outputPath, index, canBurnCaptions) {
  const safeDuration = Math.max(1, Number(duration) || 4);
  const filter = [
    `scale=1280:720:force_original_aspect_ratio=decrease`,
    `pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xFFF9F0`,
    `setsar=1`,
    ...(canBurnCaptions
      ? [
          `drawbox=x=80:y=590:w=1120:h=86:color=white@0.78:t=fill`,
          `drawtext=fontfile='${defaultFont}':text='${escapeDrawText(caption).slice(0, 52)}':x=(w-text_w)/2:y=618:fontsize=34:fontcolor=0x314348:line_spacing=8`,
        ]
      : []),
    `fade=t=in:st=0:d=0.35`,
    `fade=t=out:st=${Math.max(0, safeDuration - 0.35)}:d=0.35`,
    `fps=30`,
    `format=yuv420p`,
  ].join(',');
  await runFfmpeg([
    '-y',
    '-loop',
    '1',
    '-framerate',
    '30',
    '-t',
    String(safeDuration),
    '-i',
    panelPath,
    '-vf',
    filter,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-pix_fmt',
    'yuv420p',
    '-t',
    String(safeDuration),
    outputPath,
  ]);
}

async function createBackgroundMusic(mood, duration, outputPath) {
  const safeDuration = Math.max(1, Math.min(40, Number(duration) || 20));
  const expression =
    mood === 'fast'
      ? '0.08*sin(2*PI*392*t)*(lt(mod(t\\,0.5)\\,0.28))+0.07*sin(2*PI*523.25*t)*(lt(mod(t+0.25\\,0.5)\\,0.28))+0.045*sin(2*PI*659.25*t)*(lt(mod(t\\,1)\\,0.16))'
      : '0.08*sin(2*PI*261.63*t)+0.06*sin(2*PI*329.63*t)+0.055*sin(2*PI*392*t)+0.035*sin(2*PI*523.25*t)';
  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `aevalsrc=${expression}:s=44100:d=${safeDuration.toFixed(3)}`,
    '-af',
    `afade=t=in:st=0:d=0.5,afade=t=out:st=${Math.max(0, safeDuration - 0.7).toFixed(3)}:d=0.7`,
    '-ar',
    '44100',
    '-ac',
    '2',
    outputPath,
  ]);
}

function normalizeBgmMood(value) {
  return value === 'fast' ? 'fast' : 'soft';
}

function readBoundedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function comicStyleForIndex(index) {
  return comicStylePresets[index % comicStylePresets.length];
}

function buildComicPrompt(candidate, index) {
  const style = comicStyleForIndex(index);
  const panels = normalizePanels(candidate.panels)
    .map((panel) => {
      const storyRole = ['开端', '发展', '变化', '结尾'][Math.max(0, panel.index - 1)] || '故事画面';
      return `${panel.index}. 剧情功能：${storyRole}。画面标题：${panel.caption}。画面内容：${panel.visual}`;
    })
    .join('\n');
  return `生成一张完整的整页四格漫画，固定为“${style.label}”。
风格固定：${style.prompt}
画面气质：新中式、清爽、明亮、可爱但不幼稚，有现代儿童漫画的清晰叙事和中国风视觉韵味。
版式：2x2 四格，每格边框清晰，格子之间留白，整体是一张完整漫画页。
结构：四格按“开端、发展、变化、结尾”的叙事节奏展开，这个结构只用于理解，不要在画面中写出结构标签。
文字：每格只放短中文标题或气泡，必须简洁可读，避免大段文字。画面中禁止出现“起”“承”“转”“合”作为标签或标题前缀。
角色一致：四格中主角外观保持一致。
色彩：${style.palette}
禁止风格：写实电影风、3D 写实、赛博风、暗黑恐怖风、厚重油画风、紫色霓虹渐变、日系动漫临摹风、欧美超级英雄风。
候选编号：${index + 1}
候选风格：${style.label}
漫画标题：${candidate.title || '四格故事'}
故事分镜：
${panels}`;
}

async function createDemoComic(candidate, index) {
  const comicId = randomUUID();
  const imagePath = join(mediaDir, `${comicId}.png`);
  const panels = normalizePanels(candidate.panels);
  const style = comicStyleForIndex(index);
  const colors = [
    ['0xDFF4EA', '0xFFCFB3'],
    ['0xD8EFFF', '0xFFD86B'],
    ['0xF8E1EF', '0x98D8C1'],
    ['0xFFF1C9', '0x8BC5FF'],
  ];
  const canDrawText = await hasFfmpegFilter('drawtext');
  const filters = [];
  if (canDrawText) {
    filters.push(
      `drawtext=fontfile='${defaultFont}':text='${escapeDrawText(candidate.title || `故事候选 ${index + 1}`)}':x=70:y=38:fontsize=42:fontcolor=0x314348`,
      `drawtext=fontfile='${defaultFont}':text='${escapeDrawText(style.label)}':x=72:y=88:fontsize=22:fontcolor=0x6B7B7A`,
    );
  }

  panels.forEach((panel, panelIndex) => {
      const x = panelIndex % 2 === 0 ? 70 : 660;
      const y = panelIndex < 2 ? 120 : 470;
      const [bg, accent] = colors[(index + panelIndex) % colors.length];
      filters.push(
        `drawbox=x=${x}:y=${y}:w=520:h=285:color=${bg}:t=fill`,
        `drawbox=x=${x}:y=${y}:w=520:h=285:color=0x314348:t=4`,
        `drawbox=x=${x + 48}:y=${y + 42}:w=84:h=84:color=${accent}@0.92:t=fill`,
        `drawbox=x=${x + 172}:y=${y + 78}:w=250:h=28:color=0x5E8C82@0.32:t=fill`,
        `drawbox=x=${x + 215}:y=${y + 130}:w=210:h=22:color=0x5E8C82@0.22:t=fill`,
      );
      if (canDrawText) {
        filters.push(
          `drawtext=fontfile='${defaultFont}':text='${escapeDrawText(getPanelCaption(panel)).slice(0, 22)}':x=${x + 38}:y=${y + 208}:fontsize=28:fontcolor=0x314348`,
          `drawtext=fontfile='${defaultFont}':text='${escapeDrawText(panel.visual).slice(0, 24)}':x=${x + 38}:y=${y + 248}:fontsize=20:fontcolor=0x54706F`,
        );
      }
    });

  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0xFFF9F0:s=1240x840',
    ...(filters.length ? ['-vf', filters.join(',')] : []),
    '-frames:v',
    '1',
    imagePath,
  ]);
  const comic = {
    comicId,
    candidateId: candidate.id || `story-${index + 1}`,
    title: candidate.title || `故事候选 ${index + 1}`,
    imageUrl: mediaUrl(`${comicId}.png`),
    mimeType: 'image/png',
    styleKey: style.key,
    styleLabel: style.label,
    panels,
    createdAt: new Date().toISOString(),
  };
  await saveMeta(comicId, { ...comic, id: comicId, kind: 'comic', path: imagePath });
  return comic;
}

function createDemoStory(sourceText) {
  const seed = sourceText || demoTranscript();
  const basePanels = [
    ['小小灵感亮起来', '孩子在书桌前发现一颗发光的小星星。'],
    ['伙伴一起出发', '小机器人打开地图，邀请孩子走进想象森林。'],
    ['难题出现了', '一座云朵桥被风吹散，大家想办法修好它。'],
    ['故事圆满完成', '星星照亮四格漫画，孩子开心分享作品。'],
  ];
  const titles = ['星星小盒子', '森林邮局', '云朵火车', '月亮灯塔'];
  return {
    sourceText: seed,
    candidates: titles.map((title, candidateIndex) => ({
      id: `story-${candidateIndex + 1}`,
      title,
      theme: '勇敢表达自己的故事灵感',
      keywords: ['想象力', '伙伴', '解决问题', '分享'],
      panels: basePanels.map(([caption, visual], panelIndex) => ({
        index: panelIndex + 1,
        structure: panelStructures[panelIndex],
        caption: candidateIndex === 0 ? caption : `${caption}`,
        visual,
        emotion: ['好奇', '开心', '认真', '自豪'][panelIndex],
        voiceLine: `${caption}。`,
      })),
    })),
  };
}

function demoTranscript() {
  return '我想画一个小朋友和机器人一起探险的故事，他们找到一颗会发光的星星，最后把星星送回天空。';
}

function normalizeStoryResponse(parsed, sourceText) {
  if (!parsed || !Array.isArray(parsed.candidates)) {
    return createDemoStory(sourceText);
  }
  return {
    sourceText,
    candidates: parsed.candidates.slice(0, 4).map((candidate, index) => ({
      id: candidate.id || `story-${index + 1}`,
      title: String(candidate.title || `故事候选 ${index + 1}`).slice(0, 18),
      theme: String(candidate.theme || '四格故事').slice(0, 60),
      keywords: Array.isArray(candidate.keywords) ? candidate.keywords.slice(0, 6).map(String) : [],
      panels: normalizePanels(candidate.panels),
    })),
  };
}

function normalizePanels(panels) {
  const list = Array.isArray(panels) ? panels.slice(0, 4) : [];
  while (list.length < 4) {
    list.push({ caption: `第 ${list.length + 1} 格`, visual: '新中式漫画故事画面。' });
  }
  return list.map((panel, index) => ({
    index: index + 1,
    structure: panelStructures[index],
    caption: stripStructurePrefix(String(panel.caption || panel.voiceLine || `第 ${index + 1} 格`)).slice(0, 50),
    visual: String(panel.visual || panel.caption || '新中式漫画故事画面。').slice(0, 120),
    emotion: String(panel.emotion || '温暖').slice(0, 20),
    voiceLine: String(panel.voiceLine || panel.caption || '').slice(0, 80),
  }));
}

function stripStructurePrefix(value) {
  return value.replace(/^\s*[起承转合]\s*[：:、.\-]\s*/, '').trim();
}

function getPanelCaption(panel) {
  return stripStructurePrefix(String(panel.caption || panel.voiceLine || `第 ${panel.index || 1} 格`));
}

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { message: 'Method not allowed' });
  }
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = safeJoin(staticDir, pathname.replace(/^\/static\//, '/'));
  if (!filePath || !filePath.startsWith(staticDir)) return sendNotFound(res);
  return serveFile(req, res, filePath);
}

async function serveMedia(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { message: 'Method not allowed' });
  const filePath = safeJoin(mediaDir, url.pathname.replace(/^\/media\//, '/'));
  if (!filePath || !filePath.startsWith(mediaDir)) return sendNotFound(res);
  return serveFile(req, res, filePath);
}

async function serveFile(req, res, filePath) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return sendNotFound(res);
    res.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': fileStat.size,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  } catch {
    sendNotFound(res);
  }
}

function safeJoin(base, pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  return resolve(base, `.${relative.startsWith('/') ? relative : `/${relative}`}`);
}

function sendJson(res, statusCode, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

function sendNotFound(res) {
  sendJson(res, 404, { message: 'Not found' });
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 50 * 1024 * 1024) throw new Error('请求体过大。');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function decodeDataUrlOrBase64(value) {
  if (!value) return null;
  const text = String(value);
  const base64 = text.includes(',') ? text.split(',').pop() : text;
  return Buffer.from(base64, 'base64');
}

function extensionForMime(mimeType) {
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return '.mp3';
  if (mimeType.includes('wav')) return '.wav';
  if (mimeType.includes('ogg')) return '.ogg';
  if (mimeType.includes('mp4')) return '.m4a';
  if (mimeType.includes('webm')) return '.webm';
  return '.bin';
}

function mediaUrl(fileName) {
  return runtimePath(`/media/${encodeURIComponent(fileName)}`);
}

function absoluteMediaUrl(fileName) {
  const encodedPath = `/media/${encodeURIComponent(fileName)}`;
  const coursewarePublicUrl = configuredCoursewarePublicUrl();
  if (coursewarePublicUrl) return `${coursewarePublicUrl}${encodedPath}`;
  const publicBaseUrl = configuredPublicBaseUrl();
  if (publicBaseUrl) return `${publicBaseUrl}${runtimePath(encodedPath)}`;
  return runtimePath(encodedPath);
}

function runtimePath(pathname) {
  const cleanPath = String(pathname || '/').startsWith('/') ? String(pathname || '/') : `/${pathname}`;
  return `${courseBasePath()}${cleanPath}`;
}

function runtimeUrl(url) {
  const cloned = new URL(url.toString());
  cloned.pathname = stripRuntimeBasePath(cloned.pathname);
  return cloned;
}

function stripRuntimeBasePath(pathname) {
  const basePath = courseBasePath();
  if (!basePath) return pathname;
  if (pathname === basePath) return '/';
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || '/';
  }
  return pathname;
}

function courseBasePath() {
  const raw = String(process.env.NEXT_PUBLIC_COURSE_BASE_PATH || '').trim();
  if (!raw || raw === '/') return '';
  return `/${raw.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

function configuredPublicBaseUrl() {
  return String(process.env.COURSEWARE_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
}

function configuredCoursewarePublicUrl() {
  return String(process.env.COURSEWARE_PUBLIC_URL || '').replace(/\/+$/, '');
}

async function saveMeta(id, data) {
  await writeFile(join(metaDir, `${id}.json`), JSON.stringify(data, null, 2));
}

async function loadMeta(id) {
  if (!id || !/^[a-f0-9-]+$/i.test(id)) return null;
  try {
    return JSON.parse(await readFile(join(metaDir, `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`服务端缺少环境变量 ${name}。`);
  return value;
}

function isValidArkApiKey(value) {
  const text = String(value || '').trim();
  if (text.length < 30) return false;
  if (/^api-?key-/i.test(text)) return false;
  if (/^apikey-/i.test(text)) return false;
  return true;
}

function getArkConfigError() {
  if (!process.env.ARK_API_KEY) {
    return {
      code: 'ARK_CONFIG_MISSING',
      message: '服务端缺少 ARK_API_KEY。请在 .env.local 中填写火山方舟 API Key，用于整理故事和生成漫画。',
    };
  }
  if (!isValidArkApiKey(process.env.ARK_API_KEY)) {
    return {
      code: 'ARK_CONFIG_INVALID',
      message:
        'ARK_API_KEY 格式不对。这里要复制火山方舟表格中间“API Key”列的隐藏密钥，不是左侧名称 api-key-...，也不是右侧资源 ID apikey-...。',
    };
  }
  return null;
}

function isLocalPublicBaseUrl(value) {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname);
  } catch {
    return true;
  }
}

function loadLocalEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
  }
}

async function fetchText(url, options) {
  const { fetchOptions, cancel } = createTimedFetchOptions(options);
  try {
    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    return { ok: response.ok, status: response.status, headers: response.headers, text };
  } catch (error) {
    if (isAbortError(error)) throw new Error('远程接口超时，请稍后重试。');
    throw error;
  } finally {
    cancel();
  }
}

async function fetchJson(url, options) {
  const { fetchOptions, cancel } = createTimedFetchOptions(options);
  try {
    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    if (!response.ok) throw new Error(`远程接口失败：${response.status} ${text.slice(0, 240)}`);
    return JSON.parse(text);
  } catch (error) {
    if (isAbortError(error)) throw new Error('远程接口超时，请稍后重试。');
    throw error;
  } finally {
    cancel();
  }
}

async function downloadFile(url, filePath, timeoutMs = 60000) {
  const { fetchOptions, cancel } = createTimedFetchOptions({}, timeoutMs);
  try {
    const response = await fetch(url, fetchOptions);
    if (!response.ok) throw new Error(`下载图片失败：${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(filePath, buffer);
  } catch (error) {
    if (isAbortError(error)) throw new Error('下载图片超时，请稍后重试。');
    throw error;
  } finally {
    cancel();
  }
}

function createTimedFetchOptions(options = {}, defaultTimeoutMs = remoteRequestTimeoutMs) {
  const { timeoutMs, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(timeoutMs || defaultTimeoutMs));
  return {
    fetchOptions: { ...fetchOptions, signal: controller.signal },
    cancel: () => clearTimeout(timeout),
  };
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function isRemoteTimeoutError(error) {
  return /远程接口超时|aborted/i.test(error instanceof Error ? error.message : String(error));
}

function extractJson(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return tryJson(raw.slice(start, end + 1));
    }
    return null;
  }
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function runFfmpeg(args) {
  return runCommand('ffmpeg', args);
}

async function hasFfmpegFilter(name) {
  if (!ffmpegFiltersCache) {
    ffmpegFiltersCache = runCommand('ffmpeg', ['-hide_banner', '-filters']).catch(() => '');
  }
  const filters = await ffmpegFiltersCache;
  return new RegExp(`\\b${name}\\b`).test(filters);
}

async function probeDuration(filePath) {
  const output = await runCommand('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const duration = Number(output.trim());
  return Number.isFinite(duration) ? duration : null;
}

function commandExists(command) {
  return new Promise((resolveCheck) => {
    const child = spawn(command, ['-version']);
    child.on('error', () => resolveCheck(false));
    child.on('close', (code) => resolveCheck(code === 0));
  });
}

function runCommand(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', rejectRun);
    child.on('close', (code) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error(`${command} failed: ${stderr.slice(-1200)}`));
    });
  });
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function writePanelSubtitles(filePath, panels, segmentDuration) {
  return writePanelCaptions(filePath, panels, segmentDuration, 'srt');
}

async function writePanelCaptions(filePath, panels, segmentDuration, format) {
  const entries = normalizePanels(panels)
    .map((panel, index) => {
      const start = index * segmentDuration;
      const end = (index + 1) * segmentDuration - 0.04;
      const startText = format === 'vtt' ? formatVttTime(start) : formatSrtTime(start);
      const endText = format === 'vtt' ? formatVttTime(Math.max(start + 0.5, end)) : formatSrtTime(Math.max(start + 0.5, end));
      return [
        ...(format === 'vtt' ? [] : [String(index + 1)]),
        `${startText} --> ${endText}`,
        getPanelCaption(panel),
        '',
      ].join('\n');
    })
    .join('\n');
  await writeFile(filePath, format === 'vtt' ? `WEBVTT\n\n${entries}` : entries);
}

function formatSrtTime(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${String(ms).padStart(3, '0')}`;
}

function formatVttTime(seconds) {
  return formatSrtTime(seconds).replace(',', '.');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer ***');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeDrawText(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll(':', '\\:')
    .replaceAll(',', '\\,')
    .replaceAll("'", "\\'")
    .replaceAll('%', '\\%')
    .replaceAll('\n', ' ');
}
