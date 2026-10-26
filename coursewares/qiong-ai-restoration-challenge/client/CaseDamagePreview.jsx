import React, { useEffect, useRef, useState } from 'react';
import { loadImage } from './report';
import { caseImage, caseMask } from '../shared/restoration-cases.mjs';
import { readDamageMask, drawDamageAnnotation } from './damage-annotation';

export default function CaseDamagePreview({ item }) {
  const ref = useRef(), [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([loadImage(caseImage(item)), loadImage(caseMask(item))]).then(([image, mask]) => {
      if (!alive) return;
      const canvas = ref.current; canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const displayedWidth = Math.min(220, canvas.getBoundingClientRect().width || 180, 140 * image.width / image.height);
      drawDamageAnnotation(ctx, readDamageMask(mask, image.width, image.height), image.width, image.height, displayedWidth, true);
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [item.id]);
  return <div className="case-damage-preview"><canvas ref={ref} role="img" aria-label={`${item.shortName}，${item.damage}位置已用红色和虚线圈出`}/><span className="case-damage-label">{error ? '图片暂未读出' : item.damage}</span></div>;
}
