export const proposalImage = proposal => proposal?.results.find(r => r.state === 'succeeded' && r.fileId);

export function proposalCompletionIssue(proposal, demo = false) {
  if (['pending', 'running'].includes(proposal?.aiState)) return 'AI修复图正在生成，请等待完成后提交';
  if (!proposalImage(proposal)) return '请先成功生成1张AI修复图，再展示和提交成果';
  if (proposal.mocked && !demo) return '模拟图片不能作为正式AI修复成果，请联系老师检查AI服务';
  return '';
}

export function reusableProposals(session, demo = false) {
  return (session?.proposals || []).filter(p => !proposalCompletionIssue(p, demo) &&
    (demo || session.preparation.status === 'APPROVED' && p.snapshot.preparation?.evidenceDigest === session.preparation.evidenceDigest));
}
