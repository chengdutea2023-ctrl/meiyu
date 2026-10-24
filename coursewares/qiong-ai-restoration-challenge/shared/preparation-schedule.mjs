// Both interfaces display the same windows; the server rechecks every write.
export function preparationAccess(settings = {}, owner = {}, now = Date.now()) {
  const extension = Date.parse(owner.preparationExtension?.until || '');
  if (['DRAFT', 'RETURNED'].includes(owner.preparation?.status || 'DRAFT') && Number.isFinite(extension) && now < extension) {
    return { open: true, status: 'SUPPLEMENT', until: owner.preparationExtension.until };
  }
  if (!settings.enabled) return { open: false, status: 'PAUSED' };
  const opens = settings.opensAt ? Date.parse(settings.opensAt) : null;
  const closes = settings.closesAt ? Date.parse(settings.closesAt) : null;
  if ((opens !== null && !Number.isFinite(opens)) || (closes !== null && !Number.isFinite(closes))) return { open: false, status: 'INVALID' };
  if (opens !== null && now < opens) return { open: false, status: 'NOT_STARTED', until: settings.opensAt };
  if (closes !== null && now >= closes) return { open: false, status: 'CLOSED', until: settings.closesAt };
  return { open: true, status: 'OPEN', until: settings.closesAt || null };
}
export function beijingInput(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Date(Date.parse(value) + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
export function beijingTimestamp(value) {
  if (!value) return null;
  const date = new Date(`${value}+08:00`);
  if (!Number.isFinite(date.getTime())) throw new Error('请输入有效的北京时间');
  return date.toISOString();
}
export function displayBeijing(value) { return beijingInput(value).replace('T', ' ') || '未设置'; }
