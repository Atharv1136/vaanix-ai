export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assistants: {
        Row: {
          id: string
          name: string
          system_prompt: string
          first_message: string | null
          model: string
          voice_provider: string
          voice_id: string
          created_at: string
          updated_at: string
          is_published: boolean
        }
        Insert: {
          id?: string
          name: string
          system_prompt: string
          first_message?: string | null
          model?: string
          voice_provider?: string
          voice_id?: string
          created_at?: string
          updated_at?: string
          is_published?: boolean
        }
        Update: {
          id?: string
          name?: string
          system_prompt?: string
          first_message?: string | null
          model?: string
          voice_provider?: string
          voice_id?: string
          created_at?: string
          updated_at?: string
          is_published?: boolean
        }
        Relationships: []
      }
      tools: {
        Row: {
          id: string
          name: string
          description: string | null
          tool_type: string
          config_json: Json | null
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          tool_type: string
          config_json?: Json | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          tool_type?: string
          config_json?: Json | null
        }
        Relationships: []
      }
      assistant_tools: {
        Row: {
          id: string
          assistant_id: string
          tool_id: string
          enabled: boolean
        }
        Insert: {
          id?: string
          assistant_id: string
          tool_id: string
          enabled?: boolean
        }
        Update: {
          id?: string
          assistant_id?: string
          tool_id?: string
          enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "assistant_tools_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          }
        ]
      }
      phone_numbers: {
        Row: {
          id: string
          twilio_sid: string | null
          phone_number: string
          assistant_id: string | null
          label: string
          created_at: string
        }
        Insert: {
          id?: string
          twilio_sid?: string | null
          phone_number: string
          assistant_id?: string | null
          label: string
          created_at?: string
        }
        Update: {
          id?: string
          twilio_sid?: string | null
          phone_number?: string
          assistant_id?: string | null
          label?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_numbers_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          }
        ]
      }
      calls: {
        Row: {
          id: string
          assistant_id: string | null
          phone_number_id: string | null
          direction: string
          student_or_caller_number: string
          started_at: string
          ended_at: string | null
          duration_seconds: number
          outcome: string
          cost_estimate: number | null
        }
        Insert: {
          id?: string
          assistant_id?: string | null
          phone_number_id?: string | null
          direction?: string
          student_or_caller_number: string
          started_at?: string
          ended_at?: string | null
          duration_seconds?: number
          outcome?: string
          cost_estimate?: number | null
        }
        Update: {
          id?: string
          assistant_id?: string | null
          phone_number_id?: string | null
          direction?: string
          student_or_caller_number?: string
          started_at?: string
          ended_at?: string | null
          duration_seconds?: number
          outcome?: string
          cost_estimate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "phone_numbers"
            referencedColumns: ["id"]
          }
        ]
      }
      call_transcripts: {
        Row: {
          id: string
          call_id: string
          turn_index: number
          speaker: string
          text: string
          timestamp: string
        }
        Insert: {
          id?: string
          call_id: string
          turn_index: number
          speaker: string
          text: string
          timestamp?: string
        }
        Update: {
          id?: string
          call_id?: string
          turn_index?: number
          speaker?: string
          text?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_transcripts_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          }
        ]
      }
      kb_documents: {
        Row: {
          id: string
          tool_id: string
          title: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tool_id: string
          title: string
          content: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tool_id?: string
          title?: string
          content?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_documents_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          }
        ]
      }
      api_keys: {
        Row: {
          id: string
          key_hash: string
          label: string
          created_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          key_hash: string
          label: string
          created_at?: string
          last_used_at?: string | null
        }
        Update: {
          id?: string
          key_hash?: string
          label?: string
          created_at?: string
          last_used_at?: string | null
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          role?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
