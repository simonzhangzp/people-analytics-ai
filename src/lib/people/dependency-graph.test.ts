import { describe, expect, it } from "vitest";
import { buildDependencyGraph, dependencyClosure } from "./dependency-graph";

const definition = {
  metric_id: "headcount",
  metric_name: "Headcount",
  version: 1,
  status: "certified",
  source_tables: ["people_snap_worker_month"],
  downstream_marts: ["people_mart_workforce_overview"],
};

const lineageRows = [
  { lineage_id: "employee_to_hist", from_object: "frappe_hr.Employee", to_object: "people_hist_worker_attr", via: "mapping" },
  { lineage_id: "hist_to_snap", from_object: "people_hist_worker_attr", to_object: "people_snap_worker_month", via: "month-end" },
  { lineage_id: "unrelated", from_object: "greenhouse.Application", to_object: "people_fact_application", via: "mapping" },
];

const rules = [{ rule_id: "BR-WF-001", domain: "workforce", kind: "parametric", statement: "certified headcount" }];

describe("buildDependencyGraph", () => {
  it("builds source → canonical → transformation → rule → metric → mart → tool → case", () => {
    const graph = buildDependencyGraph({ metricId: "headcount", definition, lineageRows, rules });
    const columns = new Set(graph.nodes.map((node) => node.column));
    for (const column of ["source", "canonical", "transformation", "rule", "metric", "mart", "tool", "case"]) {
      expect(columns.has(column as never), column).toBe(true);
    }
    expect(graph.nodes.some((node) => node.label === "greenhouse.Application")).toBe(false);
  });

  it("highlights upstream and downstream closures from the metric", () => {
    const graph = buildDependencyGraph({ metricId: "headcount", definition, lineageRows, rules });
    const { upstream, downstream } = dependencyClosure(graph, "metric:headcount");
    expect(upstream.has("obj:frappe_hr.Employee")).toBe(true);
    expect(upstream.has("rule:BR-WF-001")).toBe(true);
    expect(downstream.has("mart:people_mart_workforce_overview")).toBe(true);
    expect(downstream.has("case-trust")).toBe(true);
    expect(downstream.has("obj:frappe_hr.Employee")).toBe(false);
  });

  it("reaches the source document through the registry grain table and rule citations (real data-v1 shape)", () => {
    // data-v1 has no lineage row that names "headcount"; the only anchors are grain_table and the
    // BR-WF-008 citation on employee_to_hist.
    const graph = buildDependencyGraph({
      metricId: "headcount",
      definition: { metric_id: "headcount", grain_table: "people_snap_worker_month", version: 1, status: "certified" },
      lineageRows: [
        { lineage_id: "employee_to_hist", from_object: "frappe_hr.Employee", to_object: "people_hist_worker_attr", via: "SCD2 versions", note: "BR-WF-008" },
        { lineage_id: "extract_to_change", from_object: "frappe_hr.Employee", to_object: "people_evt_worker_change", via: "extract diff", note: "BR-WF-007 T7" },
        { lineage_id: "bls_jolts_calibration", from_object: "bls.JOLTS_quits", to_object: "people_metric.voluntary_attrition_rate", via: "calibration only", note: "not GlobalTech employees" },
      ],
      rules: [{ rule_id: "BR-WF-001" }, { rule_id: "BR-WF-008" }],
    });
    const labels = graph.nodes.map((node) => node.label);
    expect(labels).toContain("frappe_hr.Employee");
    expect(labels).toContain("people_hist_worker_attr");
    expect(labels).toContain("people_snap_worker_month");
    expect(labels).not.toContain("people_evt_worker_change");
    expect(labels).not.toContain("bls.JOLTS_quits");
    const { upstream } = dependencyClosure(graph, "metric:headcount");
    expect(upstream.has("obj:frappe_hr.Employee")).toBe(true);
    expect(upstream.has("obj:people_snap_worker_month")).toBe(true);
  });

  it("collapses people_metric.<id> lineage objects onto the metric node", () => {
    const graph = buildDependencyGraph({
      metricId: "voluntary_attrition_rate",
      definition: { metric_id: "voluntary_attrition_rate", grain_table: "people_snap_worker_month" },
      lineageRows: [
        { lineage_id: "bls_jolts_calibration", from_object: "bls.JOLTS_quits", to_object: "people_metric.voluntary_attrition_rate", via: "calibration only" },
      ],
      rules: [{ rule_id: "BR-RET-001" }],
    });
    expect(graph.nodes.filter((node) => node.column === "metric")).toHaveLength(1);
    expect(graph.edges).toContainEqual({ from: "obj:bls.JOLTS_quits", to: "metric:voluntary_attrition_rate" });
  });

  it("does not duplicate nodes or edges", () => {
    const graph = buildDependencyGraph({ metricId: "headcount", definition, lineageRows, rules });
    const ids = graph.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = graph.edges.map((edge) => `${edge.from}>${edge.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
