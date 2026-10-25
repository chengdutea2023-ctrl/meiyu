import React from 'react';

export default function SourceReference({ asset }) {
  const source = String(asset.source || '').trim();
  let href = asset.builtinId ? './assets/sources.html' : '';
  if (!href) {
    const match = source.match(/https?:\/\/[^\s｜|<>]+/i);
    if (match) try {
      const url = new URL(match[0]);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) href = url.href;
    } catch { /* Non-URL source notes remain readable. */ }
  }
  return href ? <p className="source-reference"><a href={href} target="_blank" rel="noopener noreferrer">查看图片来源 ↗</a></p> : <p className="source-reference">图片来源：{source || '待补充'}</p>;
}
