export const PROPOSAL_GENERATION_LIMIT = 3;
export const PROPOSAL_PROMPT_VERSION = 'three-cases-v2';

export function proposalAllowance(owner) {
  const versions = [...(owner.tasks || []), ...(owner.resetHistory || []).flatMap(h => h.tasks || [])]
    .filter(t => t.workflowVersion === 2 && t.kind === 'proposal' && t.results.length).map(t => t.id);
  const used = Math.max(owner.proposalGenerationCount || 0, new Set(versions).size);
  return { limit: PROPOSAL_GENERATION_LIMIT, used, remaining: Math.max(0, PROPOSAL_GENERATION_LIMIT - used) };
}

export const needsPromptUpgrade = proposal => Boolean(proposal && !proposal.results.length && proposal.snapshot.promptVersion !== PROPOSAL_PROMPT_VERSION);
