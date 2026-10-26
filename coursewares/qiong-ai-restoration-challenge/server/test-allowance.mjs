// Private, operator-managed grant. It never comes from a browser request or reset.
export function readTestAllowance(value, baseRequestLimit) {
  if (!value) return null;
  let grant; try { grant=JSON.parse(value); } catch { throw Error('测试追加额度配置无法读取'); }
  if (!grant || Array.isArray(grant) || typeof grant.ownerId!=='string' || !/^[a-f0-9]{40}$/.test(grant.ownerId || '') ||
    !Number.isSafeInteger(grant.proposalLimit) || grant.proposalLimit<3 || grant.proposalLimit>100 ||
    !Number.isSafeInteger(grant.extraRequests) || grant.extraRequests<1 || grant.extraRequests>100 ||
    !Number.isSafeInteger(baseRequestLimit) || baseRequestLimit<1) throw Error('测试追加额度配置无效');
  return Object.freeze({ownerId:grant.ownerId,proposalLimit:grant.proposalLimit,extraRequests:grant.extraRequests});
}

export const totalRequestLimit = (base, grant) => base ? base+(grant?.extraRequests || 0) : 0;
export function requestBudgetIssue(count, base, grant, ownerId) {
  const limit=totalRequestLimit(base,grant);
  if(limit && count>=limit) return 'TEST_BUDGET_REACHED';
  // Additional paid requests are reserved for the one authorized student/task.
  if(grant && count>=base && ownerId!==grant.ownerId) return 'TEST_ALLOWANCE_SCOPE';
  return '';
}
