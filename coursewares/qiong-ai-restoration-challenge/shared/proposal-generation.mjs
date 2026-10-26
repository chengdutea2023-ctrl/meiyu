export const PROPOSAL_GENERATION_LIMIT = 3;
export const PROPOSAL_PROMPT_VERSION = 'three-cases-v2';

export function proposalAllowance(owner, configuredLimit = PROPOSAL_GENERATION_LIMIT) {
  const versions = [...(owner.tasks || []), ...(owner.resetHistory || []).flatMap(h => h.tasks || [])]
    .filter(t => t.workflowVersion === 2 && t.kind === 'proposal' && t.results.length).map(t => t.id);
  const used = Math.max(owner.proposalGenerationCount || 0, new Set(versions).size);
  const limit=Number.isSafeInteger(configuredLimit)&&configuredLimit>=PROPOSAL_GENERATION_LIMIT&&configuredLimit<=100?configuredLimit:PROPOSAL_GENERATION_LIMIT;
  return { limit, used, remaining: Math.max(0, limit - used) };
}

export const needsPromptUpgrade = proposal => Boolean(proposal && !proposal.results.length && proposal.snapshot.promptVersion !== PROPOSAL_PROMPT_VERSION);
