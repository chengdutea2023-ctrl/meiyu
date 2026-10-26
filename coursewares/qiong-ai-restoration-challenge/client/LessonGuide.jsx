import React from 'react';

export default function LessonGuide({ onStart }) {
  return <div className="lesson-guide">
    <section className="lesson-guide-goal">
      <span>这节课，你将学会</span>
      <h3>找到线索，说出有依据的复原理由</h3>
      <p>观察器物的口沿、器形和釉色，用自己找到的图片支持判断；证据不足时，可以说“还不能确定”。</p>
    </section>
    <ol className="lesson-guide-steps">
      <li><span>01</span><h3>我的线索</h3><p>课前自己找图、记录来源和发现。老师审核后，选择本次要用的1—3张。</p></li>
      <li><span>02</span><h3>我的复原方案</h3><p>从罐、执壶、碗中选择一件，对照自己的线索，写清“准备怎样复原、依据是什么”。红色修复位置可以调整，无需自己画完整复原图。点击“生成AI修复效果”，把方案变成候选图。</p></li>
      <li><span>03</span><h3>展示我的成果</h3><p>至少成功生成1张AI修复图后，线索、方案和图片自动整理成成果卡，再提交给老师。最多3次生成机会，可修改方案尝试不同效果。</p></li>
    </ol>
    <section className="lesson-guide-ai">
      <h3>AI依据什么做修复？</h3>
      <p><strong>你选择的残损文物图 ＋ 你选中的线索图片及发现 ＋ 你的方案 ＋ 修复位置。</strong></p>
      <p>AI把这些作为参考生成1张候选图，系统只替换修复范围。没有选中的图片不发给AI，完整原图也不会作为答案提供。</p>
      <p className="lesson-guide-boundary">AI图片是一种复原设想，不代表历史原貌。课前图片的价值，是帮助你解释“为什么这样复原”。</p>
    </section>
    <p className="lesson-guide-example">例如：“我想把缺口补成向外翻的圆口，因为线索1中的同类罐也是这种口沿。”</p>
    <div className="lesson-guide-start"><button className="primary" onClick={onStart}>我明白了，开始 <span aria-hidden="true">→</span></button><small>需要时，可点“课堂指南”重新查看。</small></div>
  </div>;
}
