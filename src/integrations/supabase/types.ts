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
      broadcast_recipients: {
        Row: {
          attempts: number
          broadcast_id: string
          email: string
          error: string | null
          id: string
          member_id: string
          recipient_type: string
          resend_message_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          broadcast_id: string
          email: string
          error?: string | null
          id?: string
          member_id: string
          recipient_type?: string
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          broadcast_id?: string
          email?: string
          error?: string | null
          id?: string
          member_id?: string
          recipient_type?: string
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "email_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_sessions: {
        Row: {
          amount_cents: number
          booking_id: string | null
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
          booking_id?: string | null
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
          booking_id?: string | null
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
            foreignKeyName: "checkout_sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
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
          monthly_mode: string
          recurrence: string
          recurrence_end_date: string | null
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
          monthly_mode?: string
          recurrence?: string
          recurrence_end_date?: string | null
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
          monthly_mode?: string
          recurrence?: string
          recurrence_end_date?: string | null
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
      email_broadcasts: {
        Row: {
          attachment_paths: Json
          body_html: string
          body_text: string | null
          created_at: string
          created_by: string | null
          failed_count: number
          id: string
          recipient_filter: Json
          scheduled_for: string | null
          sent_at: string | null
          sent_count: number
          skipped_count: number
          started_at: string | null
          status: string
          subject: string
          total_recipients: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          attachment_paths?: Json
          body_html: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          recipient_filter?: Json
          scheduled_for?: string | null
          sent_at?: string | null
          sent_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          subject: string
          total_recipients?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          attachment_paths?: Json
          body_html?: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          recipient_filter?: Json
          scheduled_for?: string | null
          sent_at?: string | null
          sent_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          subject?: string
          total_recipients?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_broadcasts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          name: string
          subject_template: string
          venue_id: string | null
        }
        Insert: {
          body_html: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name: string
          subject_template: string
          venue_id?: string | null
        }
        Update: {
          body_html?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          subject_template?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      event_exceptions: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          occurrence_date: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          occurrence_date: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          occurrence_date?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_exceptions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "club_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_exceptions_venue_id_fkey"
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
          email_opt_out: boolean
          email_opt_out_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string
          home_address: string | null
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
          unsubscribe_token: string
          venue_id: string
          whatsapp_last_inbound_at: string | null
          whatsapp_number: string | null
          whatsapp_opt_in: boolean
          whatsapp_opt_in_at: string | null
          whatsapp_opt_in_method: string | null
          whatsapp_opt_out_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          email_opt_out?: boolean
          email_opt_out_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name: string
          home_address?: string | null
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
          unsubscribe_token?: string
          venue_id: string
          whatsapp_last_inbound_at?: string | null
          whatsapp_number?: string | null
          whatsapp_opt_in?: boolean
          whatsapp_opt_in_at?: string | null
          whatsapp_opt_in_method?: string | null
          whatsapp_opt_out_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string | null
          email_opt_out?: boolean
          email_opt_out_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string
          home_address?: string | null
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
          unsubscribe_token?: string
          venue_id?: string
          whatsapp_last_inbound_at?: string | null
          whatsapp_number?: string | null
          whatsapp_opt_in?: boolean
          whatsapp_opt_in_at?: string | null
          whatsapp_opt_in_method?: string | null
          whatsapp_opt_out_at?: string | null
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
      membership_applications: {
        Row: {
          addon_members: Json | null
          boating_experience: string | null
          boats: Json | null
          business_type: string | null
          calculated_fees: Json | null
          children: Json | null
          contact_home: string | null
          contact_mobile: string
          contact_work: string | null
          created_at: string
          date_of_birth: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_number: string | null
          employer: string | null
          first_names: string
          home_address: string | null
          home_code: string | null
          id: string
          id_number: string | null
          interview_conducted_at: string | null
          member_id: string | null
          members_notified_at: string | null
          membership_category: string
          occupation: string | null
          other_clubs: string | null
          partner_dob: string | null
          partner_name: string | null
          photo_url: string | null
          postal_address: string | null
          postal_code: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          surname: string
          venue_id: string
        }
        Insert: {
          addon_members?: Json | null
          boating_experience?: string | null
          boats?: Json | null
          business_type?: string | null
          calculated_fees?: Json | null
          children?: Json | null
          contact_home?: string | null
          contact_mobile: string
          contact_work?: string | null
          created_at?: string
          date_of_birth?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_number?: string | null
          employer?: string | null
          first_names: string
          home_address?: string | null
          home_code?: string | null
          id?: string
          id_number?: string | null
          interview_conducted_at?: string | null
          member_id?: string | null
          members_notified_at?: string | null
          membership_category: string
          occupation?: string | null
          other_clubs?: string | null
          partner_dob?: string | null
          partner_name?: string | null
          photo_url?: string | null
          postal_address?: string | null
          postal_code?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          surname: string
          venue_id: string
        }
        Update: {
          addon_members?: Json | null
          boating_experience?: string | null
          boats?: Json | null
          business_type?: string | null
          calculated_fees?: Json | null
          children?: Json | null
          contact_home?: string | null
          contact_mobile?: string
          contact_work?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_number?: string | null
          employer?: string | null
          first_names?: string
          home_address?: string | null
          home_code?: string | null
          id?: string
          id_number?: string | null
          interview_conducted_at?: string | null
          member_id?: string | null
          members_notified_at?: string | null
          membership_category?: string
          occupation?: string | null
          other_clubs?: string | null
          partner_dob?: string | null
          partner_name?: string | null
          photo_url?: string | null
          postal_address?: string | null
          postal_code?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          surname?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_applications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_applications_venue_id_fkey"
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
      venue_documents: {
        Row: {
          content_markdown: string
          id: string
          kind: string
          title: string
          updated_at: string
          updated_by: string | null
          venue_id: string
        }
        Insert: {
          content_markdown?: string
          id?: string
          kind: string
          title: string
          updated_at?: string
          updated_by?: string | null
          venue_id: string
        }
        Update: {
          content_markdown?: string
          id?: string
          kind?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_documents_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_knowledge: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          is_published: boolean
          keywords: string
          priority: number
          search_tsv: unknown
          source: string | null
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
          venue_id: string
        }
        Insert: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_published?: boolean
          keywords?: string
          priority?: number
          search_tsv?: unknown
          source?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
          venue_id: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_published?: boolean
          keywords?: string
          priority?: number
          search_tsv?: unknown
          source?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_knowledge_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_knowledge_venue_id_fkey"
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
          accent_color: string
          address: string | null
          booking_code_prefix: string
          broadcast_from_email: string | null
          button_radius: string
          card_background: string
          card_border: string
          card_radius: string
          card_shadow: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          danger_color: string
          hero_gradient: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          page_background: string
          portal_domain: string | null
          primary_color: string
          slug: string
          success_color: string
          tagline: string | null
          tertiary_color: string | null
          text_muted: string
          text_primary: string
          text_secondary: string
          warning_color: string
          welcome_message: string | null
          whatsapp_ai_daily_cap: number
          whatsapp_ai_enabled: boolean
          whatsapp_ai_model: string
          whatsapp_business_number: string | null
          whatsapp_daily_cap: number
        }
        Insert: {
          accent_color?: string
          address?: string | null
          booking_code_prefix?: string
          broadcast_from_email?: string | null
          button_radius?: string
          card_background?: string
          card_border?: string
          card_radius?: string
          card_shadow?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          danger_color?: string
          hero_gradient?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          page_background?: string
          portal_domain?: string | null
          primary_color?: string
          slug: string
          success_color?: string
          tagline?: string | null
          tertiary_color?: string | null
          text_muted?: string
          text_primary?: string
          text_secondary?: string
          warning_color?: string
          welcome_message?: string | null
          whatsapp_ai_daily_cap?: number
          whatsapp_ai_enabled?: boolean
          whatsapp_ai_model?: string
          whatsapp_business_number?: string | null
          whatsapp_daily_cap?: number
        }
        Update: {
          accent_color?: string
          address?: string | null
          booking_code_prefix?: string
          broadcast_from_email?: string | null
          button_radius?: string
          card_background?: string
          card_border?: string
          card_radius?: string
          card_shadow?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          danger_color?: string
          hero_gradient?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          page_background?: string
          portal_domain?: string | null
          primary_color?: string
          slug?: string
          success_color?: string
          tagline?: string | null
          tertiary_color?: string | null
          text_muted?: string
          text_primary?: string
          text_secondary?: string
          warning_color?: string
          welcome_message?: string | null
          whatsapp_ai_daily_cap?: number
          whatsapp_ai_enabled?: boolean
          whatsapp_ai_model?: string
          whatsapp_business_number?: string | null
          whatsapp_daily_cap?: number
        }
        Relationships: []
      }
      whatsapp_followups: {
        Row: {
          created_at: string
          id: string
          member_id: string | null
          notes: string | null
          original_message: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          summary: string
          urgency: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id?: string | null
          notes?: string | null
          original_message: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          summary: string
          urgency?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string | null
          notes?: string | null
          original_message?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          summary?: string
          urgency?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_followups_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_followups_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_followups_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          created_at: string
          direction: string
          error: string | null
          from_number: string | null
          id: string
          member_id: string | null
          related_id: string | null
          related_kind: string | null
          status: string
          template_sid: string | null
          to_number: string | null
          twilio_sid: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          direction: string
          error?: string | null
          from_number?: string | null
          id?: string
          member_id?: string | null
          related_id?: string | null
          related_kind?: string | null
          status?: string
          template_sid?: string | null
          to_number?: string | null
          twilio_sid?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          from_number?: string | null
          id?: string
          member_id?: string | null
          related_id?: string | null
          related_kind?: string | null
          status?: string
          template_sid?: string | null
          to_number?: string | null
          twilio_sid?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_broadcast_batch: {
        Args: { p_broadcast_id: string; p_limit?: number }
        Returns: {
          email: string
          member_id: string
          recipient_id: string
          unsubscribe_token: string
        }[]
      }
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
      get_members_with_auth: {
        Args: { p_venue_id: string }
        Returns: {
          auth_user_id: string
          created_at: string
          email: string
          emergency_contact_name: string
          emergency_contact_phone: string
          first_name: string
          home_address: string
          id: string
          is_active: boolean
          last_name: string
          last_sign_in_at: string
          membership_number: string
          membership_type: string
          partner_email: string
          partner_first_name: string
          partner_last_name: string
          partner_name: string
          partner_phone: string
          phone: string
          venue_id: string
          whatsapp_number: string
          whatsapp_opt_in: boolean
          whatsapp_opt_in_at: string
          whatsapp_opt_in_method: string
          whatsapp_opt_out_at: string
        }[]
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
      search_venue_knowledge: {
        Args: { p_limit?: number; p_query: string; p_venue_id: string }
        Returns: {
          body: string
          category: string
          id: string
          rank: number
          source: string
          title: string
        }[]
      }
      select_broadcast_recipients: {
        Args: { p_filter?: Json; p_venue_id: string }
        Returns: {
          email: string
          id: string
          recipient_type: string
          status: string
        }[]
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
