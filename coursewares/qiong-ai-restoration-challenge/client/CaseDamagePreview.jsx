import React, { useState } from 'react';
import { caseImage } from '../shared/restoration-cases.mjs';

export default function CaseDamagePreview({ item }) {
  const src = caseImage(item);
  const [failedImage, setFailedImage] = useState('');
  return <div className="case-damage-preview">
    <img src={src} alt={`${item.shortName}，${item.damage}`} onError={() => setFailedImage(src)}/>
    <span className="case-damage-label">{failedImage === src ? '图片暂未读出' : item.damage}</span>
  </div>;
}
