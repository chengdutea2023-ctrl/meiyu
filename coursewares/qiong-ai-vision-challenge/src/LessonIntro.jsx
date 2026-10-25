import { SCORING_TEXT } from './quiz.js';

export function LessonIntro({ onStart }) {
  return <div className="lesson-intro">
    <p className="intro-lead">同一件文物，换一种图片条件，AI 还认得吗？这节课，我们一起做实验，看看计算机视觉依据什么作出判断。</p>
    <section aria-labelledby="intro-goals"><h3 id="intro-goals">这节课，你将学会</h3><ul className="intro-goals">
      <li><strong>观察 AI 的依据：</strong>对照图片，检查 AI 说的器口、壶流、把手等特征是否真的可见。</li>
      <li><strong>做一次公平的比较：</strong>每次只改变一种图片条件，观察 AI 的判断有没有变化；看不清时，应说明信息不足。</li>
      <li><strong>分清看图和查资料：</strong>外形可以观察，年代和文化价值需要查证有来源的资料。</li>
    </ul></section>
    <section aria-labelledby="intro-process"><h3 id="intro-process">接下来怎么做？</h3><ol className="intro-flow">
      <li><strong>选文物，识别原图</strong><p>先留下一次原图判断。</p></li>
      <li><strong>只改一种，再识别</strong><p>遮挡、旋转或模糊，三选一。</p></li>
      <li><strong>核对结果，查看资料</strong><p>比较 AI 的依据，再读文物知识卡。</p></li>
      <li><strong>写发现，答五道题</strong><p>记录你的观察，检查理解。</p></li>
      <li><strong>提交实验卡</strong><p>查看分项得分和逐题解释。</p></li>
    </ol></section>
    <p className="intro-reminder">建议用时 15–20 分钟。两次识别即可完成一组对照，最多识别 5 次；AI 猜错或结果没有变化，也值得记录。</p>
    <p className="intro-scoring">{SCORING_TEXT}。观察至少12字，按完成度计分；预测选填、不计分。</p>
    <div className="intro-actions"><button className="primary" autoFocus onClick={onStart}>开始实验 →</button><span>之后可点击页面上的“学习说明”再次查看。</span></div>
  </div>;
}
