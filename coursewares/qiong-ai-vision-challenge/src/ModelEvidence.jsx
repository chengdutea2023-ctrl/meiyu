function evidenceStats(info) {
  if (!info || !Array.isArray(info.validation) || !info.validation.length) return null;
  const total = info.validation.length;
  const correct = info.validation.filter(r => r.label === r.prediction).length;
  return { train: info.trainObjects, total, correct, rate: (correct / total * 100).toFixed(1) };
}

function SpecimenContext({ specimen }) {
  return <p className="model-context">{specimen?.split === 'train'
    ? '当前文物参与过本课件分类器的训练，适合观察输入变化，不能用它的表现证明模型能识别未见过的新文物。'
    : specimen?.challenge
      ? '当前文物属于类别边界观察素材。模型只认识碗、罐、壶，仍会给出三类分数，不代表它认出了准确的文物名称。'
      : '当前文物未用于本课件三分类器的训练；一次判断正确，仍不能代表模型对其他文物也可靠。'}</p>;
}

function ModelIntroductions() {
  return <div className="model-introductions">
    <article><h4>① MobileNet V1：提取图像特征</h4><p>这是适合在手机、浏览器等设备上运行的轻量视觉网络。本课件使用 0.50 / 224 版本，把处理后的图片缩放到 224 × 224 像素，提取可供分类的图像特征。</p></article>
    <article><h4>② 课堂三分类器：给三个类别打分</h4><p>它用器物图片的特征学习区分“碗、罐、壶”。这里采用训练得到的线性分类器和 Softmax，将结果变成三类相对分数；没有“看不清”或“其他”选项。</p></article>
  </div>;
}

export function ModelEvidenceSummary({ info, specimen, onDetails }) {
  const stats = evidenceStats(info);
  return <section className="model-evidence" aria-label="模型与依据">
    <div className="model-evidence-heading"><h3>这些分数从哪里来？</h3><button className="small-link" onClick={onDetails}>查看模型介绍与验证明细 ↗</button></div>
    <p>实际使用：<strong>MobileNet V1 ＋ 碗 / 罐 / 壶三分类器</strong>。每次读取当时处理后的图片，在浏览器本机计算。</p>
    <div className="model-evidence-facts">
      <div><strong>当前图片的分类分数</strong><p>表示模型在三类中更偏向哪一类，未经概率校准，不能当作“判断正确的概率”。</p></div>
      <div><strong>一批验证图片的正确率</strong><p>{stats ? `${stats.train} 件实物用于训练；另 ${stats.total} 件用于验证，正确 ${stats.correct} 件（${stats.rate}%）。这仅代表这批小样本。` : info === false ? '验证说明暂时无法加载，请刷新重试。当前图片分数仍不代表识别准确率。' : '正在读取本课件的训练与验证记录…'}</p></div>
    </div>
    <SpecimenContext specimen={specimen}/>
  </section>;
}

export function ModelEvidenceDetails({ info, specimen }) {
  const stats = evidenceStats(info);
  return <div className="model-evidence-details">
    <p>这是用来观察图像变化和模型局限的课堂分类模型。基础网络负责提取特征，课堂分类器负责给“碗、罐、壶”打分。</p>
    <ModelIntroductions/>
    <p className="model-pipeline">处理后的图片 → MobileNet 图像特征 → 三分类器 → 碗 / 罐 / 壶分类分数</p>
    <h3>百分数应该怎样读？</h3>
    <p>例如“壶 71.4%”，只表示当前图片的三类分数中更偏向“壶”。三类分数相加约为 100%，未经概率校准，不能解释为“有 71.4% 的概率判断正确”。遮挡得很严重，或输入不是这三类器物时，模型仍会分配三类分数。</p>
    <SpecimenContext specimen={specimen}/>
    <h3>本课件的训练与验证依据</h3>
    {stats ? <>
      <dl className="model-metrics"><div><dt>训练实物</dt><dd>{stats.train} 件</dd></div><div><dt>另行验证实物</dt><dd>{stats.total} 件</dd></div><div><dt>这批验证图正确率</dt><dd>{stats.correct} / {stats.total} · {stats.rate}%</dd></div></dl>
      <p>以上根据开发时保存的 {stats.total} 条验证记录统计，不是打开页面时重新跑出的评测。验证集的正确率和某张图片的分类分数是两个指标，即使数值相同也不能混用。</p>
      <p>训练图片包含 Wikimedia Commons 的邛窑器物和 The Metropolitan Museum of Art 的开放陶瓷图片，来自不同窑口与地区。同一实物的增广图片不跨训练、验证分组；新增的 4 件文物用于观察，未追加训练，也未计入这些验证结果。样本很少，不能据此声称具有普遍的文物识别准确率。</p>
      <details className="validation-records"><summary>展开 {stats.total} 条验证记录（正确 {stats.correct} 条）</summary>
        <div className="validation-table-wrap"><table><caption>开发时保存的留出验证记录</caption><thead><tr><th scope="col">验证实物与来源</th><th scope="col">标注类别</th><th scope="col">模型判断</th><th scope="col">结果</th></tr></thead><tbody>{info.validation.map(r => {
          const source = info.sources?.find(s => s.id === r.id);
          return <tr key={r.id}><td>{source?.name || source?.title || r.id}{source?.source && <a href={source.source} target="_blank" rel="noreferrer">照片来源 ↗</a>}</td><td>{r.label}</td><td>{r.prediction}</td><td>{r.label === r.prediction ? '正确' : '错误'}</td></tr>;
        })}</tbody></table></div>
      </details>
    </> : <p role="status">{info === false ? '模型验证说明暂时无法加载，请刷新后重试。' : '模型验证说明正在加载…'}</p>}
    <h3>可查看的原始依据</h3>
    <ul className="model-reference-links">
      <li><a href="./models/model-card.json" download>下载本课件模型说明、验证结果与图片来源（JSON）</a></li>
      <li><a href="https://github.com/tensorflow/tfjs-models/tree/master/mobilenet" target="_blank" rel="noreferrer">TensorFlow.js 官方 MobileNet 文档 ↗</a></li>
      <li><a href="https://arxiv.org/abs/1704.04861" target="_blank" rel="noreferrer">MobileNets 基础网络原论文 ↗</a><small>介绍基础网络架构，不代表对本课件的准确率背书。</small></li>
    </ul>
    <details className="model-technical"><summary>技术信息与可复核模型文件</summary><p>版本：{info?.version || '读取中'}。MobileNet 特征固定，使用 512 维归一化特征和训练得到的三类线性权重，再进行 Softmax 计算。当前温度参数为 {info?.temperature ?? '读取中'}，分数未作概率校准。TensorFlow.js 是本机运行这些计算的工具。</p><ul>
      <li><a href="./models/classifier.json" download>下载本课件三分类器权重</a></li>
      <li><a href="./models/model.json" download>下载基础网络结构</a></li>
      <li><a href="./models/provenance.json" download>下载基础模型来源与文件校验信息</a></li>
    </ul></details>
    <p className="muted">模型与 TensorFlow.js 使用 Apache-2.0 许可。它们适合课堂实验，不能代替文物鉴定。</p>
  </div>;
}
