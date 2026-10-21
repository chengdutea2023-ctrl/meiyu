import { LessonError, requireValue } from './domain.mjs';
export async function generateImage({ images, prompt, model, apiKey, timeoutMs = 240000, fetcher = fetch }) {
  let response;
  try { response = await fetcher('https://ark.cn-beijing.volces.com/api/v3/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, image: images, response_format: 'b64_json', size: '1K', watermark: false }), signal: AbortSignal.timeout(timeoutMs) }); }
  catch { throw new LessonError(504, 'AI_RESULT_UNKNOWN', '生成连接中断，结果状态待确认；不会自动再次扣费'); }
  if (!response.ok) { const code = response.status; await response.arrayBuffer().catch(() => {}); throw new LessonError(code === 429 ? 429 : 502, 'AI_REJECTED', code === 429 ? '生图服务繁忙，请稍后重试失败项' : '生图服务未完成本次请求，请检查开通状态后重试失败项'); }
  let b; try { b = await response.json(); } catch { throw new LessonError(502, 'AI_RESULT_UNKNOWN', '生图响应无法确认，已停止自动重试'); }
  requireValue(b?.data?.[0]?.b64_json, '生图服务没有返回图片，已停止自动重试', 'AI_RESULT_UNKNOWN', 502);
  const buffer = Buffer.from(b.data[0].b64_json, 'base64');
  requireValue(buffer.length > 1000 && buffer.length < 25e6, '生成图片内容异常，已保留任务供核查', 'AI_RESULT_UNKNOWN', 502);
  return buffer;
}
