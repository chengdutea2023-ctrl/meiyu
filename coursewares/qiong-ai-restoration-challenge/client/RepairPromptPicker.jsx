import React from 'react';
import { repairPrompts } from './repair-prompts';

export default function RepairPromptPicker({ value, onChange, disabled }) {
  return <section className="repair-prompt-picker" aria-labelledby="repair-prompt-heading">
    <h3 id="repair-prompt-heading">修补提示词</h3>
    <p>先采用线索中的可见特征，再选补配方式。也可以在下方自己填写。</p>
    <div className="repair-prompt-options" role="group" aria-label="预设修补提示词">
      {repairPrompts().map(({ id, label, description, text }) => <button
        key={id} type="button" aria-pressed={value === text} disabled={disabled} onClick={() => onChange(text)}
      >
        <strong>{label}{id === 'complete' && <span>推荐</span>}</strong>
        <small>{description}</small>
      </button>)}
    </div>
    <label className="feature-creative">
      补配方式（可自己填写）
      <textarea aria-label="我的创意补充" rows={4} maxLength={120} value={value} disabled={disabled}
        placeholder="可补充材料、接缝等想法；形状依据请在上方采用的线索中确认。"
        onChange={event => onChange(event.target.value)}/>
    </label>
  </section>;
}
