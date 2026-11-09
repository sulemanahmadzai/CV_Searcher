// Generated from the Supabase schema (Supabase MCP generate_typescript_types).
// Regenerate after schema changes.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      app_users: {
        Row: { created_at: string; role: string; user_id: string };
        Insert: { created_at?: string; role?: string; user_id: string };
        Update: { created_at?: string; role?: string; user_id?: string };
        Relationships: [];
      };
      candidate_skills: {
        Row: {
          aliases: string[];
          candidate_id: string;
          category: string;
          certification_status: string;
          evidence: Json;
          experience_count: number;
          id: string;
          in_headline: boolean;
          in_skills_section: boolean;
          is_personal: boolean;
          last_used_year: number | null;
          name: string;
          norm_name: string;
          proficiency: string;
          project_count: number;
          years_used: number | null;
        };
        Insert: {
          aliases?: string[];
          candidate_id: string;
          category: string;
          certification_status?: string;
          evidence?: Json;
          experience_count?: number;
          id?: string;
          in_headline?: boolean;
          in_skills_section?: boolean;
          is_personal?: boolean;
          last_used_year?: number | null;
          name: string;
          norm_name: string;
          proficiency?: string;
          project_count?: number;
          years_used?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["candidate_skills"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "candidate_skills_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidates: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string;
          headline: string | null;
          highest_education: string | null;
          id: string;
          location: string | null;
          phone: string | null;
          primary_file_id: string | null;
          profile: Json;
          raw_text: string;
          summary: string | null;
          total_years_experience: number | null;
          updated_at: string;
          word_count: number;
          email_norm: string | null;
          phone_norm: string | null;
          name_norm: string | null;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name: string;
          headline?: string | null;
          highest_education?: string | null;
          id?: string;
          location?: string | null;
          phone?: string | null;
          primary_file_id?: string | null;
          profile?: Json;
          raw_text?: string;
          summary?: string | null;
          total_years_experience?: number | null;
          updated_at?: string;
          word_count?: number;
          email_norm?: string | null;
          phone_norm?: string | null;
          name_norm?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["candidates"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "candidates_primary_file_id_fkey";
            columns: ["primary_file_id"];
            isOneToOne: false;
            referencedRelation: "cv_files";
            referencedColumns: ["id"];
          },
        ];
      };
      cv_files: {
        Row: {
          candidate_id: string | null;
          created_at: string;
          doc_type: string | null;
          extraction_method: string | null;
          id: string;
          mime_type: string | null;
          original_filename: string;
          processed_at: string | null;
          sha256: string;
          size_bytes: number | null;
          status: string;
          status_detail: string | null;
          storage_path: string | null;
          usage: Json | null;
          word_count: number | null;
        };
        Insert: {
          candidate_id?: string | null;
          created_at?: string;
          doc_type?: string | null;
          extraction_method?: string | null;
          id?: string;
          mime_type?: string | null;
          original_filename: string;
          processed_at?: string | null;
          sha256: string;
          size_bytes?: number | null;
          status?: string;
          status_detail?: string | null;
          storage_path?: string | null;
          usage?: Json | null;
          word_count?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["cv_files"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cv_files_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      searches: {
        Row: {
          ai_review: Json | null;
          created_at: string;
          created_by: string | null;
          id: string;
          job_description: string;
          requirements: Json;
          results: Json;
          title: string | null;
          usage: Json | null;
        };
        Insert: {
          ai_review?: Json | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          job_description: string;
          requirements?: Json;
          results?: Json;
          title?: string | null;
          usage?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["searches"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      match_skill_evidence: {
        Args: { p_min_similarity?: number; p_terms: string[] };
        Returns: {
          candidate_id: string;
          match_kind: string;
          similarity: number;
          skill_id: string;
          term: string;
        }[];
      };
      match_skill_rows: {
        Args: { p_min_similarity?: number; p_terms: string[] };
        Returns: {
          term: string;
          match_kind: string;
          similarity: number;
          skill_id: string;
          candidate_id: string;
          name: string;
          norm_name: string;
          category: string;
          in_skills_section: boolean;
          in_headline: boolean;
          experience_count: number;
          project_count: number;
          years_used: number | null;
          last_used_year: number | null;
          certification_status: string;
          proficiency: string;
          is_personal: boolean;
          evidence: Json;
        }[];
      };
      match_text_mentions: {
        Args: { p_terms: string[] };
        Returns: { candidate_id: string; hits: number; term: string }[];
      };
      skill_vocabulary: {
        Args: { p_limit?: number };
        Returns: { candidate_count: number; display_name: string; norm_name: string }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
