import React from 'react';
import { repairPrompts } from './repair-prompts';

export default function RepairPromptPicker({ caseId, value, onChange, disabled }) {
  return <section className="repair-prompt-picker" aria-labelledby="repair-prompt-heading">
    <h3 id="repair-prompt-heading">修补提示词</h3>
    <p>选一条填入下方，也可以改写或自己填写。</p>
    <div className="repair-prompt-options" role="group" aria-label="预设修补提示词">
      {repairPrompts(caseId).map(({ id, label, description, text }) => <button
        key={id} type="button" aria-pressed={value === text} disabled={disabled} onClick={() => onChange(text)}
      >
        <strong>{label}{id === 'complete' && <span>推荐</span>}</strong>
        <small>{description}</small>
      </button>)}
    </div>
    <label className="feature-creative">
      我的创意
      <textarea aria-label="我的创意补充" rows={4} maxLength={120} value={value} disabled={disabled}
        placeholder="可自己写明缺口怎么补、用什么材料。留空时按已采用的线索复原。"
        onChange={event => onChange(event.target.value)}/>
    </label>
  </section>;
}
