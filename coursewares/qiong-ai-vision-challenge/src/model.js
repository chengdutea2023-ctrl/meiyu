const query = new URLSearchParams(location.search), token = query.get('launchToken');
let demoId; try { demoId = sessionStorage.getItem('qiong-vision-demo-client'); if (!demoId) { demoId = crypto.randomUUID(); sessionStorage.setItem('qiong-vision-demo-client', demoId); } } catch { demoId = crypto.randomUUID(); }
let pending = null;
export async function loadModel() {
  const r = await fetch('./api/health', { signal: AbortSignal.timeout(12000) });
  const info = await r.json();
  if (!r.ok || !info.configured) throw new Error('计算机视觉服务尚未就绪，请联系老师。');
  return info;
}
export async function infer(canvas, experimentId) {
  const image = canvas.toDataURL('image/png');
  if (!pending || pending.image !== image || pending.experimentId !== experimentId) pending = { image, experimentId, requestId: crypto.randomUUID() };
  let r;
  try { r = await fetch('./api/recognize', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : { 'x-demo-id': demoId }) }, body: JSON.stringify(pending), signal: AbortSignal.timeout(75000) }); }
  catch { throw new Error('连接中断或等待超时，请点击识别重试；会先查询同一请求，避免重复调用。'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { pending = null; throw new Error(data.message || '本次识别未完成，次数未增加，请重试。'); }
  pending = null;
  return data.recognition;
}
