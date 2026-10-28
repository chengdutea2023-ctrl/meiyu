export const PROPOSAL_GENERATION_LIMIT = 3;
export const PROPOSAL_PROMPT_VERSION = 'clue-feature-link-v2';

export function proposalAllowance(owner, configuredLimit = PROPOSAL_GENERATION_LIMIT) {
  const attempts = new Map();
  for (const task of [...(owner.tasks || []), ...(owner.resetHistory || []).flatMap(h => h.tasks || [])]) {
    const count = (task.results || []).reduce((sum, result) => sum + Math.max(1, Number.isSafeInteger(result.attempts) ? result.attempts : 1), 0);
    if (count) attempts.set(task.id, Math.max(attempts.get(task.id) || 0, count));
  }
  const used = Math.max(owner.proposalGenerationCount || 0, [...attempts.values()].reduce((sum, count) => sum + count, 0));
  const limit=Number.isSafeInteger(configuredLimit)&&configuredLimit>=PROPOSAL_GENERATION_LIMIT&&configuredLimit<=100?configuredLimit:PROPOSAL_GENERATION_LIMIT;
  return { limit, used, remaining: Math.max(0, limit - used) };
}

export const needsPromptUpgrade = proposal => Boolean(proposal && !proposal.results.length && proposal.snapshot.promptVersion !== PROPOSAL_PROMPT_VERSION);
