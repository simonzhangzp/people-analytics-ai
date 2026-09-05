export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type WorkspaceRow = {
  id: string;
  workspace_key: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type WorkspaceInsert = {
  id?: string;
  workspace_key: string;
  user_id?: string;
  name: string;
  created_at?: string;
  updated_at?: string;
};

type KnowledgeRow = {
  id: string;
  workspace_id: string;
  entity_key: string;
  payload: Json;
  created_at: string;
  updated_at: string;
};

type KnowledgeInsert = {
  id?: string;
  workspace_id: string;
  entity_key: string;
  payload: Json;
  created_at?: string;
  updated_at?: string;
};

type AIUsageRow = {
  user_id: string;
  usage_date: string;
  request_count: number;
  created_at: string;
  updated_at: string;
};

type AIUsageInsert = {
  user_id?: string;
  usage_date?: string;
  request_count?: number;
  created_at?: string;
  updated_at?: string;
};

type WorkspaceTable = {
  Row: WorkspaceRow;
  Insert: WorkspaceInsert;
  Update: Partial<WorkspaceInsert>;
  Relationships: [];
};

type KnowledgeTable = {
  Row: KnowledgeRow;
  Insert: KnowledgeInsert;
  Update: Partial<KnowledgeInsert>;
  Relationships: [
    {
      foreignKeyName: string;
      columns: ["workspace_id"];
      isOneToOne: false;
      referencedRelation: "people_workspaces";
      referencedColumns: ["id"];
    },
  ];
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      people_workspaces: WorkspaceTable;
      people_datasets: KnowledgeTable;
      people_field_mappings: KnowledgeTable;
      people_dataset_relationships: KnowledgeTable;
      people_workbench_metrics: KnowledgeTable;
      people_analysis_questions: KnowledgeTable;
      people_insights: KnowledgeTable;
      people_executive_stories: KnowledgeTable;
      people_ai_usage: {
        Row: AIUsageRow;
        Insert: AIUsageInsert;
        Update: Partial<AIUsageInsert>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      people_consume_ai_quota: {
        Args: { [_ in never]: never };
        Returns: Array<{
          allowed: boolean;
          used: number;
          limit_count: number;
          resets_at: string;
        }>;
      };
      people_cleanup_anonymous_workbench_data: {
        Args: {
          retention?: string;
        };
        Returns: number;
      };
      people_knowledge_payload_is_safe: {
        Args: {
          payload: Json;
        };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
