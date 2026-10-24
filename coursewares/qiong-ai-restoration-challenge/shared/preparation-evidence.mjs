// Both portals present the same active student evidence; older teacher packs stay archived.
export function preparationEvidence(assets = []) {
  const own = assets.filter(asset => !asset.builtinId);
  const reference = own.filter(asset => asset.role === 'reference');
  const holdout = own.filter(asset => asset.role === 'holdout');
  const excluded = own.filter(asset => asset.role === 'excluded');
  const legacy = assets.filter(asset => asset.builtinId);
  return { reference, holdout, excluded, legacy, counts: {
    active: reference.length + holdout.length,
    reference: reference.length, holdout: holdout.length,
    excluded: excluded.length, legacy: legacy.length
  } };
}
