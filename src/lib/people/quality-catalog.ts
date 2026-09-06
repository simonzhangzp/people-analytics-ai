export type QualityCatalogRow = {
  test_name: string;
  test_id: string;
  layer: string;
  object_name: string;
  test_type: string;
  blocking: boolean;
  status: string;
  last_run_at: string | null;
};

const LAYER_ORDER = ["bronze", "silver", "gold"] as const;

export function groupQualityTestsByLayer(tests: QualityCatalogRow[]) {
  const groups = new Map<string, QualityCatalogRow[]>();
  for (const row of tests) {
    const layer = row.layer || "other";
    const list = groups.get(layer) ?? [];
    list.push(row);
    groups.set(layer, list);
  }
  const extra = [...groups.keys()].filter(
    (layer) => !LAYER_ORDER.includes(layer as (typeof LAYER_ORDER)[number]),
  );
  return [...LAYER_ORDER, ...extra]
    .filter((layer) => groups.has(layer))
    .map((layer) => ({ layer, tests: groups.get(layer) ?? [] }));
}

export function qualityLayerCounts(tests: QualityCatalogRow[]) {
  const byLayer = groupQualityTestsByLayer(tests);
  const counts: Record<string, number> = { bronze: 0, silver: 0, gold: 0 };
  for (const group of byLayer) {
    counts[group.layer] = group.tests.length;
  }
  return {
    total: tests.length,
    bronze: counts.bronze ?? 0,
    silver: counts.silver ?? 0,
    gold: counts.gold ?? 0,
    allPassed: tests.length > 0 && tests.every((row) => row.status === "passed"),
  };
}

export function groupQualityTestsByLayerAndType(tests: QualityCatalogRow[]) {
  return groupQualityTestsByLayer(tests).map((group) => {
    const types = new Map<string, QualityCatalogRow[]>();
    for (const row of group.tests) {
      const testType = row.test_type || "other";
      const list = types.get(testType) ?? [];
      list.push(row);
      types.set(testType, list);
    }
    return {
      layer: group.layer,
      byType: [...types.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([test_type, rows]) => ({ test_type, tests: rows })),
    };
  });
}
