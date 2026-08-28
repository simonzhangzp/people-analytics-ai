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
      referencedRelation: "workspaces";
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
      workspaces: WorkspaceTable;
      datasets: KnowledgeTable;
      field_mappings: KnowledgeTable;
      dataset_relationships: KnowledgeTable;
      metric_definitions: KnowledgeTable;
      analysis_questions: KnowledgeTable;
      insights: KnowledgeTable;
      executive_stories: KnowledgeTable;
      ai_usage: {
        Row: AIUsageRow;
        Insert: AIUsageInsert;
        Update: Partial<AIUsageInsert>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      consume_ai_quota: {
        Args: { [_ in never]: never };
        Returns: Array<{
          allowed: boolean;
          used: number;
          limit_count: number;
          resets_at: string;
        }>;
      };
      cleanup_anonymous_workbench_data: {
        Args: {
          retention?: string;
        };
        Returns: number;
      };
      knowledge_payload_is_safe: {
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
