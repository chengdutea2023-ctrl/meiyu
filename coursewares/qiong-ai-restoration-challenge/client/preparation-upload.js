import { boundedImage, unpackZip, readPack, roleValue } from './io.js';

function readableError(error) {
  if (error.name === 'NotReadableError') return '无法读取所选文件，请重新选图；云端文件请先下载到本机';
  if (/invalid zip|unknown compression|unexpected eof/i.test(error.message || '')) return '压缩包已损坏或格式不正确，请重新下载后再上传';
  if (error.name === 'TimeoutError') return '上传超时，请刷新确认图片是否已保存，再重试未完成的文件';
  if (/failed to fetch/i.test(error.message || '')) return '网络连接中断，请检查网络后重试；已完成的图片会保留';
  return error.message || '上传失败，请重试';
}

export async function uploadPreparationImages(files, role, { post, normalize = boundedImage, onProgress = () => {}, onAsset = () => {} }) {
  const result = { created: 0, moved: 0, existing: 0, failed: [] };
  for (const file of Array.from(files)) {
    let items;
    try {
      onProgress(file.name);
      if (/\.zip$/i.test(file.name)) items = readPack(unpackZip(await file.arrayBuffer())).images;
      else {
        if (!/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error('请选择JPG、PNG或WebP图片；HEIC请先转为JPG');
        items = [{ name: file.name, blob: file, metadata: {} }];
      }
    } catch (error) { result.failed.push({ name: file.name, message: readableError(error) }); continue; }
    for (const item of items) {
      try {
        onProgress(item.name);
        const m = item.metadata;
        const response = await post({ dataUrl: await normalize(item.blob || new Blob([item.bytes])), title: m['标题'] || item.name.replace(/\.[^.]+$/, ''), source: m['来源'] || '', feature: m['相关特征'] || '', claim: m['支持的判断'] || '', reason: m['筛选理由'] || '', role: role || roleValue(m['用途']) });
        if (!response.asset?.id || response.asset.role !== (role || roleValue(m['用途']))) throw new Error('图片未放入本组，请刷新后检查原有图片的分组');
        onAsset(response.asset);
        result[['created', 'moved', 'existing'].includes(response.uploadOutcome) ? response.uploadOutcome : 'created']++;
      } catch (error) { result.failed.push({ name: item.name, message: readableError(error) }); }
    }
  }
  return result;
}
export function uploadSummary(result, role) {
  const group = role === 'holdout' ? '核对组' : '修复参考组';
  const messages = [];
  if (result.created) messages.push(`新增${result.created}张`);
  if (result.moved) messages.push(`将${result.moved}张已有图片移入${group}`);
  if (result.existing) messages.push(`${result.existing}张已在本组，无需重复上传`);
  if (result.failed.length) messages.push(`${result.failed.length}张未完成，请查看下方原因后重试`);
  return messages.join('；') + (messages.length ? '。' : '未选择图片。');
}
