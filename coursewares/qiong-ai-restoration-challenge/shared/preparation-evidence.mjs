// Both portals present the same active student evidence; older teacher packs stay archived.
export function preparationEvidence(assets = []) {
  const own = assets.filter(asset => !asset.builtinId);
  const reference = own.filter(asset => asset.role === 'reference');
  const holdout = own.filter(asset => asset.role === 'holdout');
  const excluded = own.filter(asset => asset.role === 'excluded');
  const legacy = assets.filter(asset => asset.builtinId);
  const clues = own.filter(asset => ['clue', 'reference', 'holdout'].includes(asset.role));
  return { reference, holdout, excluded, legacy, clues, own, counts: {
    active: clues.length,
    reference: reference.length, holdout: holdout.length,
    excluded: excluded.length, legacy: legacy.length
  } };
}

export const clueLabel = (asset, assets = []) => asset.label || (asset.builtinId ? asset.title : '') || `线索${Math.max(0, assets.filter(a => !a.builtinId).findIndex(a => a.id === asset.id)) + 1}`;
export const CLUE_INSTRUCTIONS = '课外寻找与邛窑罐、执壶或碗的形状、细节或釉色有关的图片，建议1—3张。每张记下来源和一句自己的发现，提交老师审核后，课堂上用这些线索提出复原方案。数量不评分。课堂上根据线索写方案、生成AI修复图后提交成果。';
