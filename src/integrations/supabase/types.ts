export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_label: string | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Relationships: []
      }
      candidates: {
        Row: {
          active: boolean
          created_at: string
          id: string
          institution: string | null
          name: string
          order_index: number
          position_id: string
          profile: string | null
          zone: Database["public"]["Enums"]["zone"] | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          institution?: string | null
          name: string
          order_index?: number
          position_id: string
          profile?: string | null
          zone?: Database["public"]["Enums"]["zone"] | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          institution?: string | null
          name?: string
          order_index?: number
          position_id?: string
          profile?: string | null
          zone?: Database["public"]["Enums"]["zone"] | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      elections: {
        Row: {
          created_at: string
          end_at: string | null
          id: string
          name: string
          results_visible: boolean
          start_at: string | null
          status: Database["public"]["Enums"]["election_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_at?: string | null
          id?: string
          name: string
          results_visible?: boolean
          start_at?: string | null
          status?: Database["public"]["Enums"]["election_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_at?: string | null
          id?: string
          name?: string
          results_visible?: boolean
          start_at?: string | null
          status?: Database["public"]["Enums"]["election_status"]
          updated_at?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          active: boolean
          created_at: string
          election_id: string
          id: string
          kind: Database["public"]["Enums"]["position_kind"]
          order_index: number
          slug: string
          title: string
          zone: Database["public"]["Enums"]["zone"] | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          election_id: string
          id?: string
          kind: Database["public"]["Enums"]["position_kind"]
          order_index?: number
          slug: string
          title: string
          zone?: Database["public"]["Enums"]["zone"] | null
        }
        Update: {
          active?: boolean
          created_at?: string
          election_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["position_kind"]
          order_index?: number
          slug?: string
          title?: string
          zone?: Database["public"]["Enums"]["zone"] | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          candidate_id: string
          code_id: string
          created_at: string
          election_id: string
          id: string
          position_id: string
          zone: Database["public"]["Enums"]["zone"]
        }
        Insert: {
          candidate_id: string
          code_id: string
          created_at?: string
          election_id: string
          id?: string
          position_id: string
          zone: Database["public"]["Enums"]["zone"]
        }
        Update: {
          candidate_id?: string
          code_id?: string
          created_at?: string
          election_id?: string
          id?: string
          position_id?: string
          zone?: Database["public"]["Enums"]["zone"]
        }
        Relationships: [
          {
            foreignKeyName: "votes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "voting_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      voting_codes: {
        Row: {
          code: string
          device_fingerprint: string | null
          election_id: string
          generated_at: string
          id: string
          ip_address: string | null
          status: Database["public"]["Enums"]["code_status"]
          used_at: string | null
          voter_name: string | null
          zone: Database["public"]["Enums"]["zone"]
        }
        Insert: {
          code: string
          device_fingerprint?: string | null
          election_id: string
          generated_at?: string
          id?: string
          ip_address?: string | null
          status?: Database["public"]["Enums"]["code_status"]
          used_at?: string | null
          voter_name?: string | null
          zone: Database["public"]["Enums"]["zone"]
        }
        Update: {
          code?: string
          device_fingerprint?: string | null
          election_id?: string
          generated_at?: string
          id?: string
          ip_address?: string | null
          status?: Database["public"]["Enums"]["code_status"]
          used_at?: string | null
          voter_name?: string | null
          zone?: Database["public"]["Enums"]["zone"]
        }
        Relationships: [
          {
            foreignKeyName: "voting_codes_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "elections"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_super_admin: { Args: never; Returns: boolean }
      bulk_create_voting_codes: {
        Args: {
          p_election_id: string
          p_voters: Json
        }
        Returns: Json
      }
      cast_votes: {
        Args: {
          p_code: string
          p_fingerprint: string
          p_ip: string
          p_selections: Json
        }
        Returns: Json
      }
      generate_voting_codes: {
        Args: {
          p_count: number
          p_election_id: string
          p_zone: Database["public"]["Enums"]["zone"]
        }
        Returns: number
      }
      has_any_admin_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      validate_voting_code: {
        Args: { p_code: string }
        Returns: {
          code_id: string
          e_status: Database["public"]["Enums"]["election_status"]
          election_id: string
          reason: string
          valid: boolean
          voter_zone: Database["public"]["Enums"]["zone"]
        }[]
      }
    }
    Enums: {
      app_role: "super_admin" | "committee" | "observer"
      code_status: "unused" | "used" | "disabled"
      election_status: "draft" | "open" | "paused" | "closed"
      position_kind: "national" | "zonal"
      zone: "northern" | "eastern" | "western"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "committee", "observer"],
      code_status: ["unused", "used", "disabled"],
      election_status: ["draft", "open", "paused", "closed"],
      position_kind: ["national", "zonal"],
      zone: ["northern", "eastern", "western"],
    },
  },
} as const
