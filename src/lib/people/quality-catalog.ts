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
