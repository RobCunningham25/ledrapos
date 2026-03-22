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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      checkout_sessions: {
        Row: {
          amount_cents: number
          completed_at: string | null
          created_at: string | null
          id: string
          member_id: string
          metadata: Json | null
          purpose: string
          status: string
          tab_id: string | null
          venue_id: string
          yoco_checkout_id: string | null
          yoco_payment_id: string | null
        }
        Insert: {
          amount_cents: number
          completed_at?: string | null
          created_at?: string | null
          id?: string
          member_id: string
          metadata?: Json | null
          purpose: string
          status?: string
          tab_id?: string | null
          venue_id: string
          yoco_checkout_id?: string | null
          yoco_payment_id?: string | null
        }
        Update: {
          amount_cents?: number
          completed_at?: string | null
          created_at?: string | null
          id?: string
          member_id?: string
          metadata?: Json | null
          purpose?: string
          status?: string
          tab_id?: string | null
          venue_id?: string
          yoco_checkout_id?: string | null
          yoco_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_sessions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      liquor_products: {
        Row: {
          abv: number | null
          barcode: string | null
          brand: string | null
          bulk_price_cents: number | null
          bulk_units: number | null
          category: string
          created_at: string | null
          id: string
          is_active: boolean | null
          is_available: boolean | null
          min_stock_level: number
          name: string
          purchase_price_cents: number
          selling_price_cents: number
          size: string | null
          stock_level: number
          supplier: string | null
          venue_id: string
        }
        Insert: {
          abv?: number | null
          barcode?: string | null
          brand?: string | null
          bulk_price_cents?: number | null
          bulk_units?: number | null
          category: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_available?: boolean | null
          min_stock_level?: number
          name: string
          purchase_price_cents?: number
          selling_price_cents?: number
          size?: string | null
          stock_level?: number
          supplier?: string | null
          venue_id: string
        }
        Update: {
          abv?: number | null
          barcode?: string | null
          brand?: string | null
          bulk_price_cents?: number | null
          bulk_units?: number | null
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_available?: boolean | null
          min_stock_level?: number
          name?: string
          purchase_price_cents?: number
          selling_price_cents?: number
          size?: string | null
          stock_level?: number
          supplier?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquor_products_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      member_credits: {
        Row: {
          amount_cents: number
          created_at: string | null
          description: string | null
          id: string
          member_id: string
          method: string | null
          type: string
          venue_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          description?: string | null
          id?: string
          member_id: string
          method?: string | null
          type: string
          venue_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          description?: string | null
          id?: string
          member_id?: string
          method?: string | null
          type?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_credits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_credits_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      member_favorites: {
        Row: {
          created_at: string | null
          id: string
          member_id: string
          product_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          member_id: string
          product_id: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          member_id?: string
          product_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_favorites_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "liquor_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_favorites_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          is_active: boolean | null
          last_name: string
          membership_number: string
          membership_type: string
          partner_name: string | null
          phone: string | null
          venue_id: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_active?: boolean | null
          last_name: string
          membership_number: string
          membership_type?: string
          partner_name?: string | null
          phone?: string | null
          venue_id: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_active?: boolean | null
          last_name?: string
          membership_number?: string
          membership_type?: string
          partner_name?: string | null
          phone?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string | null
          id: string
          method: string
          paid_at: string | null
          reference: string | null
          tab_id: string
          venue_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          id?: string
          method: string
          paid_at?: string | null
          reference?: string | null
          tab_id: string
          venue_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          id?: string
          method?: string
          paid_at?: string | null
          reference?: string | null
          tab_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sessions: {
        Row: {
          created_at: string | null
          ended_at: string | null
          id: string
          notes: string | null
          pos_user_id: string
          started_at: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          pos_user_id: string
          started_at?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          pos_user_id?: string
          started_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sessions_pos_user_id_fkey"
            columns: ["pos_user_id"]
            isOneToOne: false
            referencedRelation: "pos_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_users: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          pin_hash: string
          role: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          pin_hash: string
          role: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          pin_hash?: string
          role?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_users_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_items: {
        Row: {
          created_at: string | null
          id: string
          line_total_cents: number
          product_id: string
          qty: number
          tab_id: string
          unit_price_cents: number
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          line_total_cents?: number
          product_id: string
          qty?: number
          tab_id: string
          unit_price_cents: number
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          line_total_cents?: number
          product_id?: string
          qty?: number
          tab_id?: string
          unit_price_cents?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "liquor_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_items_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      tabs: {
        Row: {
          cash_customer_name: string | null
          closed_at: string | null
          created_at: string | null
          id: string
          is_cash_customer: boolean | null
          member_id: string | null
          opened_at: string | null
          status: string
          venue_id: string
        }
        Insert: {
          cash_customer_name?: string | null
          closed_at?: string | null
          created_at?: string | null
          id?: string
          is_cash_customer?: boolean | null
          member_id?: string | null
          opened_at?: string | null
          status?: string
          venue_id: string
        }
        Update: {
          cash_customer_name?: string | null
          closed_at?: string | null
          created_at?: string | null
          id?: string
          is_cash_customer?: boolean | null
          member_id?: string | null
          opened_at?: string | null
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tabs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: string | null
          venue_id: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value?: string | null
          venue_id: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_settings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      commit_cart_items: {
        Args: {
          p_cash_customer_name?: string
          p_is_cash_customer?: boolean
          p_items?: Json
          p_member_id?: string
          p_venue_id: string
        }
        Returns: Json
      }
      process_payment: {
        Args: {
          p_card_amount?: number
          p_card_reference?: string
          p_cash_amount?: number
          p_credit_amount?: number
          p_member_id?: string
          p_tab_id: string
          p_venue_id: string
        }
        Returns: Json
      }
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

export const Constants = {
  public: {
    Enums: {},
  },
} as const
