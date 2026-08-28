import {
  ensureAnonymousSession,
  getSupabaseBrowserClient,
  type WorkbenchSupabaseClient,
} from "@/lib/supabase/browser";
import type { Json } from "@/lib/supabase/database.types";
import type {
  AnalysisQuestion,
  DatasetMetadata,
  DatasetRelationship,
  ExecutiveStory,
  FieldMapping,
  Insight,
  MetricDefinition,
  WorkbenchState,
} from "@/types/workbench";

const FORBIDDEN_PERSISTENCE_KEYS = new Set([
  "rows",
  "rawrows",
  "explorationrows",
  "samplevalues",
  "rawdata",
  "datarows",
  "rawrecords",
]);

type KnowledgeTableName =
  | "datasets"
  | "field_mappings"
  | "dataset_relationships"
  | "metric_definitions"
  | "analysis_questions"
  | "insights"
  | "executive_stories";

export type PersistedDatasetMetadata = Pick<
  DatasetMetadata,
  | "id"
  | "name"
  | "fingerprint"
  | "fileSize"
  | "rowCount"
  | "inferredType"
  | "typeConfidence"
  | "grain"
  | "grainConfidence"
  | "timeRange"
  | "healthScore"
  | "issues"
  | "status"
  | "safeProfile"
>;

export interface PersistedWorkbenchKnowledge {
  workspace: {
    id: string;
    name: string;
  };
  datasets: PersistedDatasetMetadata[];
  fieldMappings: FieldMapping[];
  relationships: DatasetRelationship[];
  metrics: MetricDefinition[];
  questions: AnalysisQuestion[];
  insights: Insight[];
  stories: ExecutiveStory[];
}

export class KnowledgeRepositoryError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super(`Supabase knowledge operation failed: ${operation}.`);
    this.name = "KnowledgeRepositoryError";
    this.operation = operation;
  }
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export function stripUnsafePersistenceData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripUnsafePersistenceData(item));
  }
  if (!isPlainRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !FORBIDDEN_PERSISTENCE_KEYS.has(normalizeKey(key)))
      .map(([key, child]) => [key, stripUnsafePersistenceData(child)]),
  );
}

function asJson(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(stripUnsafePersistenceData(value)),
  ) as Json;
}

function persistedDataset(metadata: DatasetMetadata): PersistedDatasetMetadata {
  return {
    id: metadata.id,
    name: metadata.name,
    fingerprint: metadata.fingerprint,
    fileSize: metadata.fileSize,
    rowCount: metadata.rowCount,
    inferredType: metadata.inferredType,
    typeConfidence: metadata.typeConfidence,
    grain: metadata.grain,
    grainConfidence: metadata.grainConfidence,
    timeRange: metadata.timeRange,
    healthScore: metadata.healthScore,
    issues: metadata.issues,
    status: metadata.status,
    safeProfile: metadata.safeProfile,
  };
}

export function serializeWorkbenchKnowledge(
  state: WorkbenchState,
): PersistedWorkbenchKnowledge {
  const knowledge: PersistedWorkbenchKnowledge = {
    workspace: {
      id: state.workspaceId,
      name: state.workspaceName,
    },
    datasets: state.datasets.map(({ metadata }) => persistedDataset(metadata)),
    fieldMappings: state.fieldMappings,
    relationships: state.relationships,
    metrics: state.metrics,
    questions: state.question ? [state.question] : [],
    insights: state.insights,
    stories: state.story ? [state.story] : [],
  };

  return stripUnsafePersistenceData(knowledge) as PersistedWorkbenchKnowledge;
}

function throwIfError(
  error: { message: string } | null,
  operation: string,
): void {
  if (error) throw new KnowledgeRepositoryError(operation);
}

function entityRecords(knowledge: PersistedWorkbenchKnowledge): Record<
  KnowledgeTableName,
  Array<{ entityKey: string; payload: unknown }>
> {
  return {
    datasets: knowledge.datasets.map((dataset) => ({
      entityKey: dataset.id,
      payload: dataset,
    })),
    field_mappings: knowledge.fieldMappings.map((mapping) => ({
      entityKey: mapping.id,
      payload: mapping,
    })),
    dataset_relationships: knowledge.relationships.map((relationship) => ({
      entityKey: relationship.id,
      payload: relationship,
    })),
    metric_definitions: knowledge.metrics.map((metric) => ({
      entityKey: metric.id,
      payload: metric,
    })),
    analysis_questions: knowledge.questions.map((question) => ({
      entityKey: question.id,
      payload: question,
    })),
    insights: knowledge.insights.map((insight) => ({
      entityKey: insight.id,
      payload: insight,
    })),
    executive_stories: knowledge.stories.map((story) => ({
      entityKey: story.id,
      payload: story,
    })),
  };
}

export class SupabaseKnowledgeRepository {
  constructor(private readonly client: WorkbenchSupabaseClient) {}

  private async replaceCollection(
    table: KnowledgeTableName,
    workspaceId: string,
    records: Array<{ entityKey: string; payload: unknown }>,
  ): Promise<void> {
    const existingResult = await this.client
      .from(table)
      .select("entity_key")
      .eq("workspace_id", workspaceId);
    throwIfError(existingResult.error, `read ${table}`);

    if (records.length === 0) {
      if ((existingResult.data?.length ?? 0) === 0) return;
      const deleteResult = await this.client
        .from(table)
        .delete()
        .eq("workspace_id", workspaceId);
      throwIfError(deleteResult.error, `clear ${table}`);
      return;
    }

    const upsertResult = await this.client.from(table).upsert(
      records.map(({ entityKey, payload }) => ({
        workspace_id: workspaceId,
        entity_key: entityKey,
        payload: asJson(payload),
      })),
      { onConflict: "workspace_id,entity_key" },
    );
    throwIfError(upsertResult.error, `write ${table}`);

    const desiredKeys = new Set(records.map(({ entityKey }) => entityKey));
    const staleKeys =
      existingResult.data
        ?.map(({ entity_key }) => entity_key)
        .filter((key) => !desiredKeys.has(key)) ?? [];
    if (staleKeys.length === 0) return;

    const deleteResult = await this.client
      .from(table)
      .delete()
      .eq("workspace_id", workspaceId)
      .in("entity_key", staleKeys);
    throwIfError(deleteResult.error, `remove stale ${table}`);
  }

  async saveWorkbenchState(state: WorkbenchState): Promise<void> {
    const session = await ensureAnonymousSession(this.client);
    const knowledge = serializeWorkbenchKnowledge(state);

    const workspaceResult = await this.client
      .from("workspaces")
      .upsert(
        {
          workspace_key: knowledge.workspace.id,
          user_id: session.user.id,
          name: knowledge.workspace.name,
        },
        { onConflict: "user_id,workspace_key" },
      )
      .select("id")
      .single();
    throwIfError(workspaceResult.error, "write workspace");
    if (!workspaceResult.data) {
      throw new KnowledgeRepositoryError("resolve workspace");
    }

    const records = entityRecords(knowledge);
    await Promise.all(
      (Object.keys(records) as KnowledgeTableName[]).map((table) =>
        this.replaceCollection(table, workspaceResult.data.id, records[table]),
      ),
    );
  }

  async loadWorkbenchKnowledge(
    workspaceKey: string,
  ): Promise<PersistedWorkbenchKnowledge | null> {
    const session = await ensureAnonymousSession(this.client);
    const workspaceResult = await this.client
      .from("workspaces")
      .select("id,workspace_key,name")
      .eq("user_id", session.user.id)
      .eq("workspace_key", workspaceKey)
      .maybeSingle();
    throwIfError(workspaceResult.error, "read workspace");
    if (!workspaceResult.data) return null;
    const workspace = workspaceResult.data;

    const tables: KnowledgeTableName[] = [
      "datasets",
      "field_mappings",
      "dataset_relationships",
      "metric_definitions",
      "analysis_questions",
      "insights",
      "executive_stories",
    ];
    const results = await Promise.all(
      tables.map(async (table) => {
        const result = await this.client
          .from(table)
          .select("payload")
          .eq("workspace_id", workspace.id)
          .order("created_at", { ascending: true });
        throwIfError(result.error, `read ${table}`);
        return [
          table,
          result.data?.map(({ payload }) => payload) ?? [],
        ] as const;
      }),
    );
    const payloads = Object.fromEntries(results) as Record<
      KnowledgeTableName,
      Json[]
    >;

    return {
      workspace: {
        id: workspace.workspace_key,
        name: workspace.name,
      },
      datasets: payloads.datasets as unknown as PersistedDatasetMetadata[],
      fieldMappings: payloads.field_mappings as unknown as FieldMapping[],
      relationships:
        payloads.dataset_relationships as unknown as DatasetRelationship[],
      metrics: payloads.metric_definitions as unknown as MetricDefinition[],
      questions: payloads.analysis_questions as unknown as AnalysisQuestion[],
      insights: payloads.insights as unknown as Insight[],
      stories: payloads.executive_stories as unknown as ExecutiveStory[],
    };
  }

}

export async function createKnowledgeRepository(): Promise<SupabaseKnowledgeRepository | null> {
  const client = getSupabaseBrowserClient();
  if (!client) return null;
  await ensureAnonymousSession(client);
  return new SupabaseKnowledgeRepository(client);
}
