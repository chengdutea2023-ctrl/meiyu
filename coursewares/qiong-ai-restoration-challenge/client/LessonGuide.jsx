import React from 'react';

export default function LessonGuide({ onStart, generationLimit=3 }) {
  return <div className="lesson-guide">
    <section className="lesson-guide-goal">
      <span>这节课，你将学会</span>
      <h3>找到线索，说出有依据的复原理由</h3>
      <p>观察器物的口沿、器形和釉色，用自己找到的图片支持判断；证据不足时，可以说“还不能确定”。</p>
    </section>
    <ol className="lesson-guide-steps">
      <li><span>01</span><h3>我的线索</h3><p>课前自己找图、记录来源和发现。老师审核后，选择本次要用的1—3张。</p></li>
      <li><span>02</span><h3>我的复原方案</h3><p>从罐、执壶、碗中选择一件，点“帮我找特征”，确认线索中的部位和特征，再点“采用这个特征”。方案会自动整理；材料等额外想法标为自己的创意。生成后，把线索局部与修复局部并排核对。</p></li>
      <li><span>03</span><h3>展示我的成果</h3><p>至少成功生成1张AI修复图后，线索、方案和图片自动整理成成果卡，再提交给老师。本次任务最多{generationLimit}次生成机会，失败后重试也算一次；重新进入或重新开始不会增加次数。</p></li>
    </ol>
    <section className="lesson-guide-ai">
      <h3>AI依据什么做修复？</h3>
      <p><strong>残损文物图 ＋ 你确认采用的图片特征 ＋ 创意补充 ＋ 修复位置。</strong></p>
      <p>AI应把采用的形状、比例、釉色等特征用于缺口；生成后逐条提示“已体现、未体现、看不清”，你还需要自己观察。未采用的图片不进入生图请求，完整原图不作为答案提供。</p>
      <p className="lesson-guide-boundary">AI图片是一种复原设想，不代表历史原貌。图片中的可见特征成为具体修复要求；AI核对不鉴定年代与真伪，也不作为分数。</p>
    </section>
    <p className="lesson-guide-example">例如：“我想把缺口补成向外翻的圆口，因为线索1中的同类罐也是这种口沿。”</p>
    <div className="lesson-guide-start"><button className="primary" onClick={onStart}>我明白了，开始 <span aria-hidden="true">→</span></button><small>需要时，可点“课堂指南”重新查看。</small></div>
  </div>;
}
