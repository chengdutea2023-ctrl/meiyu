import { requireValue } from "./domain.mjs";

export function assertAssetDeletable(owner, asset) {
  const id = asset.id;
  const tasks = [
    ...(owner.tasks || []),
    ...(owner.resetHistory || []).flatMap((entry) => entry.tasks || []),
  ];
  const referenced = tasks.some((task) => {
    const snapshot = task.snapshot || {};
    return (
      ["clueIds", "referenceIds", "holdoutIds"].some((key) =>
        snapshot[key]?.includes(id),
      ) ||
      snapshot.evidence?.some((item) => item.id === id) ||
      snapshot.constraints?.some((item) => item.evidenceId === id) ||
      snapshot.featureSelections?.some((item) => item.clueId === id)
    );
  });
  requireValue(
    !asset.builtinId &&
      !asset.usedInGeneration &&
      !owner.holdoutFrozen?.includes(id) &&
      !referenced &&
      !owner.evidenceJobs?.some((job) => job.clueIds?.includes(id)),
    "这张线索已用于方案、实验或AI识别，需要保留供追溯；不再使用请选“这次不用”",
    "ASSET_IN_USE",
  );
}
