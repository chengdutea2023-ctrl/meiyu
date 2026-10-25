export function ArtifactKnowledge({ specimen, unlocked }) {
  if (!specimen) return null;
  const knowledge=specimen.knowledge;
  return <section className="artifact-knowledge" aria-labelledby="knowledge-title"><div className="knowledge-heading"><h3 id="knowledge-title">文物知识卡</h3><span>资料查证</span></div>{!unlocked?<p>先让 AI 观察图片，识别后再查看年代与文化价值，对照它看到了什么、哪些知识需要查资料。</p>:<>
    <dl><div><dt>资料名称</dt><dd>{specimen.title}</dd></div><div><dt>年代</dt><dd>{specimen.era} <small>（照片资料标注）</small></dd></div><div><dt>展出地点</dt><dd>{specimen.museum} <small>（照片记录）</small></dd></div></dl>
    {knowledge?<><h4>历史与文化价值</h4><p>{knowledge.value}</p><p className="knowledge-question">对照想一想：{knowledge.compare}</p></>:<p>价值资料暂未收录，请通过来源继续查证。</p>}
    <p className="knowledge-note">名称和年代来自原始照片资料；价值说明是同类器物与邛窑背景的学习解读，不是 AI 识图结论，也不提供市场估价。</p>
    <div className="knowledge-sources"><a href={specimen.source} target="_blank" rel="noreferrer">名称与年代：原始照片资料 ↗</a>{knowledge?.references?.map(ref=><a key={ref.url} href={ref.url} target="_blank" rel="noreferrer">{ref.label} ↗</a>)}</div>
  </>}</section>;
}
