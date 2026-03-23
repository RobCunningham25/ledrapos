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
      admin_users: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          email: string
          id: string
          is_active: boolean
          name: string
          role: string
          venue_id: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean
          name: string
          role?: string
          venue_id: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          role?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_blackouts: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          reason: string | null
          site_id: string | null
          start_date: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          reason?: string | null
          site_id?: string | null
          start_date: string
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          reason?: string | null
          site_id?: string | null
          start_date?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_blackouts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "booking_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_blackouts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payments: {
        Row: {
          amount_cents: number
          booking_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          method: string
          reference: string | null
          status: string
          venue_id: string
        }
        Insert: {
          amount_cents: number
          booking_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          method: string
          reference?: string | null
          status?: string
          venue_id: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          method?: string
          reference?: string | null
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_site_link: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          nights: number
          price_per_night_cents: number
          site_id: string
          subtotal_cents: number
          venue_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          nights: number
          price_per_night_cents: number
          site_id: string
          subtotal_cents: number
          venue_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          nights?: number
          price_per_night_cents?: number
          site_id?: string
          subtotal_cents?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_site_link_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_site_link_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "booking_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_site_link_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_sites: {
        Row: {
          capacity: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_virtual: boolean
          name: string
          price_cents: number
          pricing_tiers: Json | null
          site_number: number | null
          site_type: string
          sort_order: number
          venue_id: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_virtual?: boolean
          name: string
          price_cents?: number
          pricing_tiers?: Json | null
          site_number?: number | null
          site_type: string
          sort_order?: number
          venue_id: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_virtual?: boolean
          name?: string
          price_cents?: number
          pricing_tiers?: Json | null
          site_number?: number | null
          site_type?: string
          sort_order?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_sites_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_code: string
          cancelled_at: string | null
          cancelled_by: string | null
          check_in: string
          check_out: string
          created_at: string
          created_by_member_id: string | null
          expires_at: string | null
          guest_email: string
          guest_name: string
          guest_phone: string | null
          id: string
          member_id: string | null
          membership_number: string | null
          notes: string | null
          num_guests: number
          payment_method: string | null
          status: string
          total_price_cents: number
          venue_id: string
        }
        Insert: {
          booking_code: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          check_in: string
          check_out: string
          created_at?: string
          created_by_member_id?: string | null
          expires_at?: string | null
          guest_email: string
          guest_name: string
          guest_phone?: string | null
          id?: string
          member_id?: string | null
          membership_number?: string | null
          notes?: string | null
          num_guests?: number
          payment_method?: string | null
          status?: string
          total_price_cents?: number
          venue_id: string
        }
        Update: {
          booking_code?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          check_in?: string
          check_out?: string
          created_at?: string
          created_by_member_id?: string | null
          expires_at?: string | null
          guest_email?: string
          guest_name?: string
          guest_phone?: string | null
          id?: string
          member_id?: string | null
          membership_number?: string | null
          notes?: string | null
          num_guests?: number
          payment_method?: string | null
          status?: string
          total_price_cents?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_created_by_member_id_fkey"
            columns: ["created_by_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
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
      club_events: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string | null
          event_date: string
          id: string
          location: string | null
          start_time: string | null
          title: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date: string
          id?: string
          location?: string | null
          start_time?: string | null
          title: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date?: string
          id?: string
          location?: string | null
          start_time?: string | null
          title?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_events_venue_id_fkey"
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
      member_boat_sheds: {
        Row: {
          created_at: string | null
          id: string
          member_id: string
          shed_number: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          member_id: string
          shed_number: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          member_id?: string
          shed_number?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_boat_sheds_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_boat_sheds_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      member_boats: {
        Row: {
          boat_name: string
          created_at: string | null
          id: string
          member_id: string
          registration_number: string | null
          venue_id: string
        }
        Insert: {
          boat_name: string
          created_at?: string | null
          id?: string
          member_id: string
          registration_number?: string | null
          venue_id: string
        }
        Update: {
          boat_name?: string
          created_at?: string | null
          id?: string
          member_id?: string
          registration_number?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_boats_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_boats_venue_id_fkey"
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
      member_sites: {
        Row: {
          created_at: string | null
          id: string
          member_id: string
          site_number: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          member_id: string
          site_number: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          member_id?: string
          site_number?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_sites_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_sites_venue_id_fkey"
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
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string
          id: string
          is_active: boolean | null
          last_name: string
          membership_number: string
          membership_type: string
          partner_email: string | null
          partner_first_name: string | null
          partner_last_name: string | null
          partner_name: string | null
          partner_phone: string | null
          phone: string | null
          venue_id: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name: string
          id?: string
          is_active?: boolean | null
          last_name: string
          membership_number: string
          membership_type?: string
          partner_email?: string | null
          partner_first_name?: string | null
          partner_last_name?: string | null
          partner_name?: string | null
          partner_phone?: string | null
          phone?: string | null
          venue_id: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string
          id?: string
          is_active?: boolean | null
          last_name?: string
          membership_number?: string
          membership_type?: string
          partner_email?: string | null
          partner_first_name?: string | null
          partner_last_name?: string | null
          partner_name?: string | null
          partner_phone?: string | null
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
