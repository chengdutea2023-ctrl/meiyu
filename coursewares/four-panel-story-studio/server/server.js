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
const assetsDir = join(rootDir, 'assets');
const bgmAssets = {
  soft: join(assetsDir, 'bgm', 'nastelbom-asian-asian-china-chinese-music-501705.mp3'),
  fast: join(assetsDir, 'bgm', 'nastelbom-chinese-new-year-455963.mp3'),
};
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
    label: '水墨写意新中式漫画',
    prompt:
      '水墨写意新中式漫画。宣纸肌理，松烟墨，浓淡干湿，毛笔线条有呼吸感，大面积留白，山雾、屋檐、烟气和环境用写意笔触表现，关键物件只用少量淡彩点染；人物要雅致、清秀、线描干净，带有东方审美的角色设计。',
    palette: '米白宣纸底、淡墨灰、松烟黑、竹青、浅湖蓝、赭石、极少量暖色点缀，整体低饱和但层次丰富。',
    avoid:
      '不要画成铅笔草稿、褪色草图、水彩贴片或空洞背景；人物不要丑脸、怪脸、僵硬脸，水墨要有明确场景、人物动作和故事推进。',
  },
  {
    key: 'storybook',
    label: '欧式故事书卡通漫画',
    prompt:
      '欧式故事书卡通漫画。柔软笔触，圆润人物，暖色纸面，建筑与自然环境有手绘质感。构图像经典故事书插画，色彩温和，光影细腻；人物设定精致，脸部柔和漂亮，服装和发型有细节。',
    palette: '暖米白、柔和草绿、浅蓝灰、陶土红、淡金色、木质棕，整体温和明亮。',
    avoid:
      '不要做成贴纸素材、廉价矢量图或空白大色块；不要粗糙路人脸，手绘质感要完整，背景和角色都要有细节。',
  },
  {
    key: 'adventure',
    label: '高饱和冒险卡通漫画',
    prompt:
      '高饱和冒险卡通漫画。明亮色彩，清楚轮廓，动态分镜，角色动作鲜明，场景和关键物件保持故事重点。主角有辨识度，动作漂亮，表情有感染力；色彩丰富但不杂乱，整体像完整的精品卡通故事漫画。',
    palette: '亮青绿、天空蓝、暖黄、橙红、奶油白、少量深色轮廓，明快有活力。',
    avoid:
      '不要过度花哨，不要让颜色抢走故事主体，不要做成游戏图标或碎片素材；人物不要幼稚变形或廉价素材感。',
  },
  {
    key: 'newspaper',
    label: '美式报刊卡通漫画',
    prompt:
      '精品美式报刊卡通漫画插画。粗细有变化的黑色轮廓，简洁明快的色块，轻微纸张颗粒，分镜节奏强。人物动作夸张但克制，脸部清爽耐看，比例自然，场景和关键物件用清楚图形化方式表现。',
    palette: '米白纸面、墨黑轮廓、复古红、湖蓝、橄榄绿、暖黄色，印刷感清楚。',
    avoid:
      '不要做成粗糙报刊涂鸦、现代扁平图标或色块过空；不要路人脸、怪表情，线稿要有手绘漫画感和完成度。',
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

  const prompt = `你是四格漫画分镜编剧。请把口语故事整理成 1 套标准四格漫画分镜。
要求：
- 必须有 title、theme、keywords、panels 四格。
- 原始表达是最高优先级。必须保留原文里的主角、地点、物品、动作、事件顺序和结局倾向。
- 不要生成多个故事版本。后续只会改变美术风格，故事内容必须固定。
- 如果原文没有出现机器人、星星、森林、云桥、魔法地图、城堡等元素，禁止自行添加这些通用幻想元素。
- 如果原文很短，可以补充情绪、环境和动作细节，但补充内容必须围绕原文已有元素展开。
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
- candidates 只能包含 1 项。

原始表达：
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
      temperature: 0.35,
      max_tokens: 3000,
      thinking: { type: 'disabled' },
    }),
  });

  const content = completion?.choices?.[0]?.message?.content || '';
  const parsed = normalizeStoryResponse(extractJson(content), sourceText);
  return sendJson(res, 200, parsed);
}

async function generateComics(res, body) {
  const sourceText = String(body.sourceText || body.transcript || '').trim();
  const inputCandidates = Array.isArray(body.candidates) ? body.candidates : [];
  const baseCandidate = inputCandidates[0]
    ? { ...inputCandidates[0], sourceText: inputCandidates[0].sourceText || sourceText }
    : null;
  if (!baseCandidate) return sendJson(res, 400, { message: '缺少四格故事分镜。' });
  const candidates = createStyleCandidates(baseCandidate, sourceText);
  if (body.demo) {
    const comics = await Promise.all(candidates.map((candidate, index) => createDemoComic(candidate, index)));
    return sendJson(res, 200, { comics });
  }
  const arkConfigError = getArkConfigError();
  if (arkConfigError) return sendJson(res, 503, arkConfigError);

  const comics = await mapWithConcurrency(candidates, comicGenerationConcurrency, generateComicCandidate);
  return sendJson(res, 200, { comics });
}

function createStyleCandidates(baseCandidate, sourceText) {
  const panels = normalizePanels(baseCandidate.panels);
  const title = String(baseCandidate.title || titleFromSource(sourceText) || '四格故事').slice(0, 18);
  return comicStylePresets.map((style, index) => ({
    ...baseCandidate,
    id: `${baseCandidate.id || 'story-1'}-style-${index + 1}`,
    title,
    theme: baseCandidate.theme || '同一故事的不同美术风格',
    keywords: Array.isArray(baseCandidate.keywords) ? baseCandidate.keywords : keywordsFromSource(sourceText),
    sourceText: baseCandidate.sourceText || sourceText,
    styleKey: style.key,
    styleLabel: displayStoryLabel(index),
    actualStyleLabel: style.label,
    panels,
  }));
}

async function generateComicCandidate(candidate, index) {
  const comicId = randomUUID();
  const imagePath = join(mediaDir, `${comicId}.jpg`);
  const style = comicStyleForIndex(index);
  let prompt = buildComicPrompt(candidate, index);
  let imageResponse;
  try {
    imageResponse = await requestComicImage(prompt);
  } catch (error) {
    if (isArkInputPolicyError(error)) {
      prompt = buildComicPrompt(candidate, index, { safeMode: true });
      try {
        imageResponse = await requestComicImage(prompt);
      } catch (retryError) {
        throw new Error(`第 ${index + 1} 套漫画触发平台文本风控，已自动重试但仍失败：${retryError.message || retryError}`);
      }
    } else {
      if (isRemoteTimeoutError(error)) {
        throw new Error(`第 ${index + 1} 套漫画生成超时。Seedream 生图有时会超过 ${Math.round(imageGenerationTimeoutMs / 1000)} 秒，请稍后重试。`);
      }
      throw new Error(`第 ${index + 1} 套漫画生成失败：${error.message || error}`);
    }
  }
  const remoteUrl = imageResponse?.data?.[0]?.url;
  if (!remoteUrl) throw new Error(`第 ${index + 1} 套漫画没有返回图片 URL。`);
  await downloadFile(remoteUrl, imagePath, imageDownloadTimeoutMs);
  const comic = {
    comicId,
    candidateId: candidate.id || `story-${index + 1}`,
    title: candidate.title || '四格故事',
    imageUrl: mediaUrl(`${comicId}.jpg`),
    mimeType: 'image/jpeg',
    styleKey: style.key,
    styleLabel: displayStoryLabel(index),
    actualStyleLabel: style.label,
    layout: 'grid-2x2-wide',
    panels: normalizePanels(candidate.panels),
    prompt,
    createdAt: new Date().toISOString(),
  };
  await saveMeta(comicId, { ...comic, kind: 'comic', path: imagePath });
  return comic;
}

async function requestComicImage(prompt) {
  return fetchJson(`${arkBaseUrl}/images/generations`, {
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
}

function isArkInputPolicyError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /InputTextSensitiveContentDetected|PolicyViolation|copyright restrictions/i.test(message);
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
  const panelPaths = await splitComicIntoPanels(comic.path, workDir, comic.layout);
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
      `[2:a]volume=${bgmMood === 'fast' ? '0.12' : '0.1'},apad,atrim=0:${duration.toFixed(3)}[bgm];` +
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
          <div class="card-kicker">${escapeXml(comic.styleLabel || `故事${index + 1}`)}</div>
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

      .show-card {
        display: block;
        width: 100%;
        margin: 0;
        overflow: hidden;
      }

      .voice-row {
        display: grid;
        grid-template-columns: minmax(320px, 0.82fr) minmax(0, 1.18fr);
        gap: 24px;
        align-items: stretch;
        min-height: 272px;
      }

      .voice-row .show-card {
        min-height: 272px;
      }

      .audio-card h2 {
        background: #ffdcca;
      }

      .transcript-card h2 {
        background: var(--yellow);
      }

      .transcript-card .media-pad {
        display: grid;
        min-height: 190px;
        align-items: start;
      }

      .comic-section h2 {
        background: #e8f7f2;
      }

      .section-note {
        margin: 0;
        padding: 0 0 16px;
        color: #52645f;
        font-size: clamp(15px, 1.2vw, 19px);
        font-weight: 850;
        line-height: 1.45;
      }

      .media-pad {
        padding: 18px;
      }

      .comic-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 24px;
        padding: 18px;
      }

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

        .voice-row,
        .comic-grid {
          grid-template-columns: 1fr;
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

        <section class="voice-row" aria-label="学生原声和识别文字">
          <section class="show-card audio-card">
            <h2>学生原声</h2>
            <div class="media-pad">
              <audio controls preload="metadata" src="${escapeXml(audio.url || '')}"></audio>
            </div>
          </section>

          <section class="show-card transcript-card">
            <h2>识别文字</h2>
            <div class="media-pad">
              <p class="transcript">${escapeXml(transcript || '学生录音已保存。')}</p>
            </div>
          </section>
        </section>

        <section class="show-card comic-section" aria-label="四张候选漫画">
          <h2>四张候选漫画</h2>
          <div class="comic-grid">
            ${comicCards}
          </div>
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

async function splitComicIntoPanels(imagePath, workDir, layout) {
  const isHorizontalStrip = layout === 'horizontal-strip';
  const gridCrops = [
    ['iw/2', 'ih/2', '0', '0'],
    ['iw/2', 'ih/2', 'iw/2', '0'],
    ['iw/2', 'ih/2', '0', 'ih/2'],
    ['iw/2', 'ih/2', 'iw/2', 'ih/2'],
  ];
  const crops = isHorizontalStrip
    ? [
      ['iw/4', 'ih', '0', '0'],
      ['iw/4', 'ih', 'iw/4', '0'],
      ['iw/4', 'ih', 'iw/2', '0'],
      ['iw/4', 'ih', 'iw*3/4', '0'],
    ]
    : gridCrops;
  const panelPaths = [];
  for (let index = 0; index < crops.length; index += 1) {
    const panelPath = join(workDir, `panel-${index}.jpg`);
    await runFfmpeg([
      '-y',
      '-i',
      imagePath,
      '-vf',
      `crop=${crops[index][0]}:${crops[index][1]}:${crops[index][2]}:${crops[index][3]},scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xFFF9F0`,
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
  const assetPath = bgmAssets[normalizeBgmMood(mood)];
  if (assetPath && existsSync(assetPath)) {
    await runFfmpeg([
      '-y',
      '-stream_loop',
      '-1',
      '-i',
      assetPath,
      '-t',
      safeDuration.toFixed(3),
      '-af',
      `atrim=0:${safeDuration.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.45,afade=t=out:st=${Math.max(0, safeDuration - 0.8).toFixed(3)}:d=0.8`,
      '-ar',
      '44100',
      '-ac',
      '2',
      outputPath,
    ]);
    return;
  }

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

function displayStoryLabel(index) {
  return `故事${index + 1}`;
}

function buildComicPrompt(candidate, index, options = {}) {
  const style = comicStyleForIndex(index);
  const safeMode = options.safeMode === true;
  const sourceText = String(candidate.sourceText || '').trim();
  const panels = normalizePanels(candidate.panels)
    .map((panel) => {
      const storyRole = ['开端', '发展', '变化', '结尾'][Math.max(0, panel.index - 1)] || '故事画面';
      return `${panel.index}. ${storyRole}：${panel.visual}。人物情绪和动作：${panel.emotion || '自然、明确'}。`;
    })
    .join('\n');
  const title = candidate.title || titleFromSource(sourceText) || '四格故事';
  const styleInstructions = safeMode
    ? `风格固定：${style.label}。清晰的宽幅四格漫画，线条干净，人物和场景完整，色彩协调，人物五官自然耐看，所有角色造型保持自创和统一。`
    : `风格固定：${style.prompt}
风格避让：${style.avoid}
色彩：${style.palette}`;
  return `请生成一张高完成度的宽幅 2×2 四格漫画，固定为“${style.label}”。

最高优先级：必须忠实表现下面这段原始录音，不要改成通用模板故事。
${sourceText || '以分镜内容为准'}

${styleInstructions}

版式硬约束：
- 完整宽幅 2×2 四格漫画，上面两格、下面两格，阅读顺序为左上、右上、左下、右下。
- 整张图约 16:10 横向比例；每一格都是横向小画幅，宽度略大于高度，不能是正方形格子，也不能做横向四连格。
- 四格边框清晰、间距均匀，不要裁切任何一格；每格都要为后续 16:9 视频裁切保留足够主体空间。
- 每一格都要有清楚的前景角色、中景动作和背景环境，不能只画空景或符号。

文字硬约束：
- 图片里不能出现任何文字、汉字、英文、标题、字幕、气泡、标签、页码、水印、签名。
- 也不要写“起”“承”“转”“合”或分镜标题，所有叙事只能通过画面完成。

人物美术硬约束：
- 人物五官清秀自然，脸型协调，眼神灵动，表情有感染力；不能是粗糙路人脸。
- 姿态、手部、肩颈和身体比例必须正确；服装、发型、背包、道具要有设计感和完成度。
- 同一角色在四格中脸型、发型、服装、年龄和体型要一致。
- 不要丑脸、怪脸、五官错位、眼神呆滞、僵硬笑容、手指畸形、身体比例失衡、廉价网页漫画人物、素材库人物。

故事忠实度硬约束：
1. 原始录音中的人物、地点、物品、动作、冲突和结局必须优先保留。
2. 如果原文明确提到森林、恶魔、怪物、城堡、机器人、星星、魔法等元素，必须按原文忠实画出来；如果原文没有提到，严禁自行添加这些模板元素。
3. 不要把故事改写成“小小灵感亮起来、伙伴一起出发、难题出现了、故事圆满完成”这类通用模板。
4. 不要为了中式风格添加与原文无关的寺庙、佛像、山门、古装僧人、梅花、蝴蝶、宫殿；只有原文提到或分镜确实需要时才使用。
5. 同一个地点和重要物件要前后连贯。
6. 冲突场景可以紧张、有动作，但不要血腥、恐怖、暴力细节。

画质要求：
- 出版级漫画插画，高完成度，线稿干净，构图有层次，人物表情动作明确。
- 不是草稿，不是简笔画，不是贴纸素材，不是素材库拼贴，不是 3D 渲染。
- 画面要完整、细腻、统一，有明确的风格辨识度和漫画分镜完成度。

不采用：写实电影风、3D 写实、赛博风、暗黑恐怖风、厚重油画风、紫色霓虹渐变、通用素材库风格、廉价国潮海报风。
候选编号：${index + 1}
候选风格：${style.label}
故事标题（只给模型理解，不能写进图片）：${title}
故事分镜（所有风格必须使用同一套内容，只改变画风）：
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
  const filters = [];
  const panelWidth = 704;
  const panelHeight = 440;
  const gapX = 64;
  const gapY = 40;
  panels.forEach((panel, panelIndex) => {
    const x = gapX + (panelIndex % 2) * (panelWidth + gapX);
    const y = gapY + Math.floor(panelIndex / 2) * (panelHeight + gapY);
    const [bg, accent] = colors[(index + panelIndex) % colors.length];
    filters.push(
      `drawbox=x=${x}:y=${y}:w=${panelWidth}:h=${panelHeight}:color=${bg}:t=fill`,
      `drawbox=x=${x}:y=${y}:w=${panelWidth}:h=${panelHeight}:color=0x314348:t=4`,
      `drawbox=x=${x + 78}:y=${y + 68}:w=142:h=142:color=${accent}@0.88:t=fill`,
      `drawbox=x=${x + 112}:y=${y + 218}:w=480:h=96:color=0x5E8C82@0.18:t=fill`,
      `drawbox=x=${x + 86}:y=${y + 338}:w=532:h=48:color=0x314348@0.12:t=fill`,
      `drawbox=x=${x + 222}:y=${y + 398}:w=260:h=28:color=0x5E8C82@0.2:t=fill`,
    );
  });

  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0xFFF9F0:s=1600x1000',
    ...(filters.length ? ['-vf', filters.join(',')] : []),
    '-frames:v',
    '1',
    imagePath,
  ]);
  const comic = {
    comicId,
    candidateId: candidate.id || `story-${index + 1}`,
    title: candidate.title || '四格故事',
    imageUrl: mediaUrl(`${comicId}.png`),
    mimeType: 'image/png',
    styleKey: style.key,
    styleLabel: displayStoryLabel(index),
    actualStyleLabel: style.label,
    layout: 'grid-2x2-wide',
    panels,
    createdAt: new Date().toISOString(),
  };
  await saveMeta(comicId, { ...comic, id: comicId, kind: 'comic', path: imagePath });
  return comic;
}

function createDemoStory(sourceText) {
  const seed = sourceText || demoTranscript();
  const basePanels = [
    ['古镇小院', '小云和外婆在古镇小院里照顾一盆梅花。'],
    ['春风吹来', '春风吹起窗边的画纸，画纸飘向石桥旁。'],
    ['沿河寻找', '小云沿着小河和石桥认真寻找画纸。'],
    ['窗前新画', '小云把找回的画纸画成梅花故事，挂在窗前和外婆一起欣赏。'],
  ];
  return {
    sourceText: seed,
    candidates: [
      {
        id: 'story-1',
        title: '古镇窗前的梅花',
        theme: '照顾、寻找和分享自己的小故事',
        keywords: ['古镇', '外婆', '梅花', '画纸'],
        sourceText: seed,
        panels: basePanels.map(([caption, visual], panelIndex) => ({
          index: panelIndex + 1,
          structure: panelStructures[panelIndex],
          caption,
          visual,
          emotion: ['安静', '惊讶', '认真', '开心'][panelIndex],
          voiceLine: `${caption}。`,
        })),
      },
    ],
  };
}

function demoTranscript() {
  return '我想画小云和外婆在古镇小院里照顾梅花，春风把画纸吹走了，小云沿着小河找回来，最后把梅花故事挂在窗前。';
}

function normalizeStoryResponse(parsed, sourceText) {
  if (!parsed || !Array.isArray(parsed.candidates)) {
    return createFallbackStory(sourceText);
  }
  const first = parsed.candidates[0];
  if (!first) return createFallbackStory(sourceText);
  return {
    sourceText,
    candidates: [
      {
        id: first.id || 'story-1',
        title: String(first.title || titleFromSource(sourceText) || '四格故事').slice(0, 18),
        theme: String(first.theme || '四格故事').slice(0, 60),
        keywords: Array.isArray(first.keywords) ? first.keywords.slice(0, 6).map(String) : keywordsFromSource(sourceText),
        sourceText,
        panels: normalizePanels(first.panels),
      },
    ],
  };
}

function createFallbackStory(sourceText) {
  const seed = normalizeSourceText(sourceText || demoTranscript());
  const title = titleFromSource(seed);
  const snippets = splitSourceIntoFourParts(seed);
  return {
    sourceText: seed,
    candidates: [
      {
        id: 'story-1',
        title,
        theme: `围绕原始录音创作：${seed.slice(0, 48)}`,
        keywords: keywordsFromSource(seed),
        sourceText: seed,
        panels: snippets.map((snippet, panelIndex) => ({
          index: panelIndex + 1,
          structure: panelStructures[panelIndex],
          caption: ['故事开始', '继续发生', '出现变化', '最后结果'][panelIndex],
          visual: snippet,
          emotion: ['好奇', '投入', '紧张', '开心'][panelIndex],
          voiceLine: snippet.slice(0, 80),
        })),
      },
    ],
  };
}

function normalizeSourceText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '')
    .trim()
    .slice(0, 500);
}

function splitSourceIntoFourParts(sourceText) {
  const seed = normalizeSourceText(sourceText);
  const sentences = seed
    .split(/[。！？!?；;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (sentences.length >= 4) return sentences.slice(0, 4);
  if (sentences.length === 3) return [sentences[0], sentences[1], sentences[2], `最后围绕“${sentences[2]}”收束故事。`];
  if (sentences.length === 2) {
    return [
      `故事从“${sentences[0]}”开始。`,
      `接着发生“${sentences[1]}”。`,
      `中间出现一个和“${sentences[1]}”有关的变化。`,
      `最后围绕“${sentences[0]}、${sentences[1]}”完成故事。`,
    ];
  }
  const one = sentences[0] || seed || '学生自己的故事';
  return [
    `故事从这里开始：${one}`,
    `事情继续发展：${one}`,
    `中间出现变化：${one}`,
    `最后得到结果：${one}`,
  ];
}

function titleFromSource(sourceText) {
  const cleaned = normalizeSourceText(sourceText).replace(/[，。！？!?；;、,.]/g, ' ').trim();
  const first = cleaned.split(/\s+/).find(Boolean) || '我的故事';
  return (first.length > 10 ? first.slice(0, 10) : first) || '我的故事';
}

function keywordsFromSource(sourceText) {
  const chunks = normalizeSourceText(sourceText)
    .split(/[，。！？!?；;、,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  return Array.from(new Set(chunks)).slice(0, 6);
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
    visual: String(panel.visual || panel.caption || '新中式漫画故事画面。').slice(0, 220),
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
