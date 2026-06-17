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
      api_clients: {
        Row: {
          api_key_hash: string
          api_key_prefix: string
          brand_logo_url: string | null
          brand_name: string
          created_at: string
          default_provider_id: string | null
          enabled: boolean
          hmac_secret_enc: string
          id: string
          name: string
          rate_limit_per_min: number
          return_url: string
          updated_at: string
          webhook_url: string
        }
        Insert: {
          api_key_hash: string
          api_key_prefix: string
          brand_logo_url?: string | null
          brand_name?: string
          created_at?: string
          default_provider_id?: string | null
          enabled?: boolean
          hmac_secret_enc: string
          id?: string
          name: string
          rate_limit_per_min?: number
          return_url: string
          updated_at?: string
          webhook_url: string
        }
        Update: {
          api_key_hash?: string
          api_key_prefix?: string
          brand_logo_url?: string | null
          brand_name?: string
          created_at?: string
          default_provider_id?: string | null
          enabled?: boolean
          hmac_secret_enc?: string
          id?: string
          name?: string
          rate_limit_per_min?: number
          return_url?: string
          updated_at?: string
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_clients_default_provider_id_fkey"
            columns: ["default_provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          details: Json
          id: number
          resource_id: string | null
          resource_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          created_at?: string
          details?: Json
          id?: number
          resource_id?: string | null
          resource_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          details?: Json
          id?: number
          resource_id?: string | null
          resource_type?: string | null
        }
        Relationships: []
      }
      automation_jobs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          last_heartbeat_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          result: Json | null
          status: Database["public"]["Enums"]["job_status"]
          transaction_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          last_heartbeat_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          result?: Json | null
          status?: Database["public"]["Enums"]["job_status"]
          transaction_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          last_heartbeat_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          result?: Json | null
          status?: Database["public"]["Enums"]["job_status"]
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_jobs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      providers: {
        Row: {
          base_url: string
          created_at: string
          currency: string
          enabled: boolean
          exchange_rate: number
          flow_config: Json
          id: string
          login_password_enc: string
          login_username_enc: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          base_url: string
          created_at?: string
          currency?: string
          enabled?: boolean
          exchange_rate?: number
          flow_config?: Json
          id?: string
          login_password_enc: string
          login_username_enc: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          base_url?: string
          created_at?: string
          currency?: string
          enabled?: boolean
          exchange_rate?: number
          flow_config?: Json
          id?: string
          login_password_enc?: string
          login_username_enc?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          apb_session_id: string
          api_client_id: string
          checkout_ready_at: string | null
          checkout_url: string | null
          client_user_id: string
          completed_at: string | null
          created_at: string
          currency: string
          error_code: string | null
          error_message: string | null
          id: string
          initialized_at: string
          metadata: Json
          payment_method_target: string
          provider_id: string
          provider_reference: string | null
          smm_transaction_id: string
          status: Database["public"]["Enums"]["txn_status"]
          updated_at: string
          worker_picked_at: string | null
        }
        Insert: {
          amount: number
          apb_session_id: string
          api_client_id: string
          checkout_ready_at?: string | null
          checkout_url?: string | null
          client_user_id: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          initialized_at?: string
          metadata?: Json
          payment_method_target?: string
          provider_id: string
          provider_reference?: string | null
          smm_transaction_id: string
          status?: Database["public"]["Enums"]["txn_status"]
          updated_at?: string
          worker_picked_at?: string | null
        }
        Update: {
          amount?: number
          apb_session_id?: string
          api_client_id?: string
          checkout_ready_at?: string | null
          checkout_url?: string | null
          client_user_id?: string
          completed_at?: string | null
          created_at?: string
          currency?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          initialized_at?: string
          metadata?: Json
          payment_method_target?: string
          provider_id?: string
          provider_reference?: string | null
          smm_transaction_id?: string
          status?: Database["public"]["Enums"]["txn_status"]
          updated_at?: string
          worker_picked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_api_client_id_fkey"
            columns: ["api_client_id"]
            isOneToOne: false
            referencedRelation: "api_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
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
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          last_response: string | null
          last_status_code: number | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          status: Database["public"]["Enums"]["delivery_status"]
          transaction_id: string
          updated_at: string
          url: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          last_response?: string | null
          last_status_code?: number | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          status?: Database["public"]["Enums"]["delivery_status"]
          transaction_id: string
          updated_at?: string
          url: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          last_response?: string | null
          last_status_code?: number | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          status?: Database["public"]["Enums"]["delivery_status"]
          transaction_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_ip: string | null
          last_seen_at: string | null
          metadata: Json
          name: string
          worker_token_hash: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_ip?: string | null
          last_seen_at?: string | null
          metadata?: Json
          name: string
          worker_token_hash: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_ip?: string | null
          last_seen_at?: string | null
          metadata?: Json
          name?: string
          worker_token_hash?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_automation_jobs: {
        Args: { _limit?: number; _worker_id: string }
        Returns: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          last_heartbeat_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          result: Json | null
          status: Database["public"]["Enums"]["job_status"]
          transaction_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "automation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operator"
      delivery_status: "PENDING" | "SUCCESS" | "FAILED" | "GIVEN_UP"
      job_status: "PENDING" | "LOCKED" | "DONE" | "FAILED"
      txn_status:
        | "INITIALIZED"
        | "WORKER_PICKED"
        | "CHECKOUT_READY"
        | "REDIRECTED"
        | "COMPLETED"
        | "FAILED"
        | "TIMEOUT"
        | "PENDING_MANUAL_AUDIT"
        | "CANCELLED"
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
      app_role: ["admin", "operator"],
      delivery_status: ["PENDING", "SUCCESS", "FAILED", "GIVEN_UP"],
      job_status: ["PENDING", "LOCKED", "DONE", "FAILED"],
      txn_status: [
        "INITIALIZED",
        "WORKER_PICKED",
        "CHECKOUT_READY",
        "REDIRECTED",
        "COMPLETED",
        "FAILED",
        "TIMEOUT",
        "PENDING_MANUAL_AUDIT",
        "CANCELLED",
      ],
    },
  },
} as const
