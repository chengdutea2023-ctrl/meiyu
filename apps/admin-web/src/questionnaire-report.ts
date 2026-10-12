type ReportArtifact = { originalFileName?: string; title?: string; mimeType?: string; kind?: string; url: string };
const MAX_REPORT_BYTES = 64 * 1024;

export function isYoloQuestionnaire(artifact: ReportArtifact) {
  return artifact.kind === 'report' &&
    /^环境识别问卷\.(json|txt)$/.test(artifact.originalFileName || artifact.title || '') &&
    ['application/json', 'text/plain'].includes(artifact.mimeType || '');
}

export function readableQuestionnaire(content: string, mimeType: string) {
  if (new TextEncoder().encode(content).byteLength > MAX_REPORT_BYTES) throw new Error('问卷内容过大');
  if (mimeType === 'text/plain') {
    if (!content.trim()) throw new Error('问卷内容为空');
    return content.replace(/^\uFEFF/, '');
  }
  const report: unknown = JSON.parse(content);
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('问卷格式不正确');
  const data = report as Record<string, unknown>;
  if (data.title !== '环境物体识别' || typeof data.answer !== 'string' || !data.answer.trim()) throw new Error('缺少问卷回答');
  const photos = Array.isArray(data.photos) ? data.photos.slice(0, 3) : [];
  const observations = photos.map((photo: unknown, index) => {
    const detections = photo && typeof photo === 'object' && 'detections' in photo && Array.isArray(photo.detections) ? photo.detections : [];
    const labels = detections.slice(0, 200).flatMap((box: unknown) => {
      if (!box || typeof box !== 'object' || !('name' in box) || typeof box.name !== 'string') return [];
      const confidence = 'p' in box && typeof box.p === 'number' && Number.isFinite(box.p) && box.p >= 0 && box.p <= 1
        ? `（${Math.round(box.p * 100)}%）` : '';
      return [box.name + confidence];
    });
    return `图片 ${index + 1}：${labels.join('、') || '未检测到明确目标'}`;
  });
  return `环境物体识别 · 本课问卷\n\n问题：请写下你对模型识别物体的理解和认识。\n\n学生回答：\n${data.answer}\n\n作品识别记录：\n${observations.join('\n') || '未记录'}\n\n评价状态：未评分，待评价`;
}

export async function loadQuestionnaire(artifact: ReportArtifact, signal?: AbortSignal) {
  if (!isYoloQuestionnaire(artifact)) throw new Error('不是本课问卷');
  const url = new URL(artifact.url, window.location.href);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('问卷地址无效');
  const controller = new AbortController(), cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = window.setTimeout(cancel, 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error('无法读取问卷');
    if (Number(response.headers.get('content-length')) > MAX_REPORT_BYTES) throw new Error('问卷内容过大');
    return readableQuestionnaire(await response.text(), artifact.mimeType || '');
  } finally {
    window.clearTimeout(timer);signal?.removeEventListener('abort', cancel);
  }
}
