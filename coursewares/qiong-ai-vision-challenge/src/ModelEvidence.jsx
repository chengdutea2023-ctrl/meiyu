import { useEffect, useState } from 'react';

export function ModelEvidenceSummary({ onDetails }) {
  return <section className="model-evidence" aria-label="计算机视觉与依据">
    <div className="model-evidence-heading"><h3>计算机视觉如何看图？</h3><button className="small-link" onClick={onDetails}>查看计算机视觉介绍与实测依据 ↗</button></div>
    <p><strong>计算机视觉</strong>依据图片中的可见线索，用短句描述器类、形态和判断依据。</p>
    <div className="model-evidence-facts"><div><strong>只看本次图片</strong><p>发送遮挡、旋转或模糊后的实际图片，不提供文物名称、标准答案、你的预测和前次答案。</p></div><div><strong>判断有依据，也有边界</strong><p>看不清时应说明信息不足；流畅的解释也可能出错，请对照图片检查。这里不提供伪精确的识别率。</p></div></div>
    <p className="model-context">每次识别都独立进行，前后回答可能不同；课堂不以 AI 猜对与否评分。</p>
  </section>;
}

export function ModelEvidenceDetails() {
  const [validation,setValidation]=useState(null);
  useEffect(()=>{fetch('./models/vision-validation.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(setValidation).catch(()=>setValidation(false));},[]);
  return <div className="model-evidence-details">
    <p>本课件使用<strong>计算机视觉</strong>观察当前图片，通过服务端完成识别，返回器类名称、可见依据和不确定之处。</p>
    <div className="model-introductions"><article><h4>计算机视觉：看图并解释</h4><p>计算机视觉利用图像中的特征辅助判断。本课件观察器口、器腹、把手、壶流等可见形态，给出器类名称和文字依据。它不是文物鉴定系统，也不能仅凭照片可靠确定窑口、年代和藏品编号。</p></article><article><h4>本课件怎样使用它？</h4><p>每次只发送一张当前实验图，配合同一份固定观察要求。没有附带标准器物名称、资料说明、学生预测或历史回答，没有联网检索，也没有针对这11件文物追加训练。</p></article></div>
    <p className="model-pipeline">当前实验图片 → 计算机视觉独立识别 → 器类名称 / 可见依据 / 不确定之处 → 学生核对</p>
    <h3>“可辨认”“暂不确定”“信息不足”是什么意思？</h3><p>这是对本次证据充分程度的文字判断，不是经过测量的正确概率。即使写“可辨认”，也可能认错或描述错；“信息不足”时不应强行给出名称。遮挡后仍有轮廓可见，可能继续判断；完全看不到器物时，应说无法判断。</p>
    <h3>本次课件的真实实测依据</h3>
    {validation?<><p>{validation.description}</p><p>测试日期：{validation.date}；识别方式：计算机视觉。以下为保存的真实接口结果，供核对本课件效果，不能代表对所有文物的准确率。我们无法查证这些公开图片是否曾进入训练数据，因此不宣称“从未见过”。</p><ul>{validation.limitations?.map((text,i)=><li key={i}>{text}</li>)}</ul><details className="validation-records"><summary>展开 {validation.cases.length} 条实测记录</summary><div className="validation-table-wrap"><table><thead><tr><th>测试图与条件</th><th>AI判断</th><th>可见依据与边界</th></tr></thead><tbody>{validation.cases.map((r,i)=><tr key={i}><td>{r.name} · {r.condition}</td><td>{r.result.name}</td><td>{r.result.evidence.join('；')}<br/>{r.result.uncertainty}</td></tr>)}</tbody></table></div></details><a href="./models/vision-validation.json" download>下载本次实测记录</a></>:<p>{validation===false?'实测明细暂时无法加载，请稍后重试。':'正在读取实测记录…'}</p>}
    <h3>参考资料</h3><ul className="model-reference-links"><li><a href="https://docs.volcengine.com/docs/ark/image-understanding?lang=zh" target="_blank" rel="noreferrer">图像理解接口与输入要求 ↗</a></li><li><a href="https://docs.volcengine.com/docs/82379/1330310?lang=zh" target="_blank" rel="noreferrer">图像理解能力说明 ↗</a></li><li><a href="https://docs.volcengine.com/docs/ark/structured-output-beta?lang=zh" target="_blank" rel="noreferrer">结构化输出说明 ↗</a></li></ul>
    <details className="model-technical"><summary>实验方法与旧记录说明</summary><p>保持相同的观察要求与服务版本，使用当前画布像素独立识别，不带图片文件名、文物标签或历史对话。即使输入与参数相同，也不保证每次输出完全一致。</p><p>旧版本仅区分碗、罐、壶，百分数为未经概率校准的相对分数。旧草稿完整保留并标明旧版；不同版本结果不混作同一组对照。旧版训练和验证统计不能用于评价当前服务。</p></details>
  </div>;
}
