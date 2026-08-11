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
      account_balances: {
        Row: {
          account_id: string
          credit_total: number
          debit_total: number
          fy_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          credit_total?: number
          debit_total?: number
          fy_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          credit_total?: number
          debit_total?: number
          fy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_balances_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
        ]
      }
      alternate_group_members: {
        Row: {
          group_id: string
          id: string
          is_default: boolean
          item_id: string
          priority: number
        }
        Insert: {
          group_id: string
          id?: string
          is_default?: boolean
          item_id: string
          priority?: number
        }
        Update: {
          group_id?: string
          id?: string
          is_default?: boolean
          item_id?: string
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "alternate_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "alternate_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alternate_group_members_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      alternate_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      attendance: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          created_by: string | null
          hours: number
          id: string
          note: string | null
          ot_hours: number
          shift: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string | null
          user_id: string | null
          work_date: string
          worker_id: string | null
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          created_by?: string | null
          hours?: number
          id?: string
          note?: string | null
          ot_hours?: number
          shift?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string | null
          user_id?: string | null
          work_date: string
          worker_id?: string | null
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          created_by?: string | null
          hours?: number
          id?: string
          note?: string | null
          ot_hours?: number
          shift?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string | null
          user_id?: string | null
          work_date?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: number
          ip: unknown
          summary: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
          ip?: unknown
          summary?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
          ip?: unknown
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_no: string | null
          account_type: string
          bank_name: string | null
          card_last_four: string | null
          created_at: string
          created_by: string | null
          credit_limit: number | null
          gl_account_code: string
          id: string
          ifsc: string | null
          name: string
          opening_balance: number
          opening_date: string | null
          payment_due_day: number | null
          status: string
          updated_at: string | null
        }
        Insert: {
          account_no?: string | null
          account_type?: string
          bank_name?: string | null
          card_last_four?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          gl_account_code?: string
          id?: string
          ifsc?: string | null
          name: string
          opening_balance?: number
          opening_date?: string | null
          payment_due_day?: number | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          account_no?: string | null
          account_type?: string
          bank_name?: string | null
          card_last_four?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          gl_account_code?: string
          id?: string
          ifsc?: string | null
          name?: string
          opening_balance?: number
          opening_date?: string | null
          payment_due_day?: number | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_gl_account_code_fkey"
            columns: ["gl_account_code"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "bank_accounts_gl_account_code_fkey"
            columns: ["gl_account_code"]
            isOneToOne: false
            referencedRelation: "mv_trial_balance"
            referencedColumns: ["account_code"]
          },
        ]
      }
      bank_csv_column_mapping: {
        Row: {
          bank_account_id: string
          created_at: string
          created_by: string | null
          date_format: string | null
          id: string
          mapping_json: Json
          updated_at: string | null
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          created_by?: string | null
          date_format?: string | null
          id?: string
          mapping_json?: Json
          updated_at?: string | null
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          created_by?: string | null
          date_format?: string | null
          id?: string
          mapping_json?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_csv_column_mapping_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: true
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_csv_column_mapping_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_imports: {
        Row: {
          bank_account_id: string
          closing_balance: number | null
          duplicate_count: number
          file_hash: string | null
          file_name: string | null
          id: string
          imported_at: string
          imported_by: string | null
          inserted_count: number
          period_end: string | null
          period_start: string | null
          row_count: number
        }
        Insert: {
          bank_account_id: string
          closing_balance?: number | null
          duplicate_count?: number
          file_hash?: string | null
          file_name?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          inserted_count?: number
          period_end?: string | null
          period_start?: string | null
          row_count?: number
        }
        Update: {
          bank_account_id?: string
          closing_balance?: number | null
          duplicate_count?: number
          file_hash?: string | null
          file_name?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          inserted_count?: number
          period_end?: string | null
          period_start?: string | null
          row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_imports_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          created_at: string
          dedup_key: string
          description: string | null
          direction: Database["public"]["Enums"]["bank_txn_direction"]
          id: string
          import_id: string | null
          matched: boolean
          matched_at: string | null
          ref_no: string | null
          running_balance: number | null
          txn_date: string
          value_date: string | null
        }
        Insert: {
          amount: number
          bank_account_id: string
          created_at?: string
          dedup_key: string
          description?: string | null
          direction: Database["public"]["Enums"]["bank_txn_direction"]
          id?: string
          import_id?: string | null
          matched?: boolean
          matched_at?: string | null
          ref_no?: string | null
          running_balance?: number | null
          txn_date: string
          value_date?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string
          created_at?: string
          dedup_key?: string
          description?: string | null
          direction?: Database["public"]["Enums"]["bank_txn_direction"]
          id?: string
          import_id?: string | null
          matched?: boolean
          matched_at?: string | null
          ref_no?: string | null
          running_balance?: number | null
          txn_date?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_txn_matches: {
        Row: {
          amount: number
          bank_transaction_id: string
          id: string
          journal_entry_id: string | null
          matched_at: string
          matched_by: string | null
          payment_id: string | null
          receipt_id: string | null
        }
        Insert: {
          amount?: number
          bank_transaction_id: string
          id?: string
          journal_entry_id?: string | null
          matched_at?: string
          matched_by?: string | null
          payment_id?: string | null
          receipt_id?: string | null
        }
        Update: {
          amount?: number
          bank_transaction_id?: string
          id?: string
          journal_entry_id?: string | null
          matched_at?: string
          matched_by?: string | null
          payment_id?: string | null
          receipt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_txn_matches_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_txn_matches_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_txn_matches_matched_by_fkey"
            columns: ["matched_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_txn_matches_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "supplier_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_txn_matches_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "customer_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_lines: {
        Row: {
          alternate_group_id: string | null
          bom_id: string
          child_item_id: string | null
          created_at: string
          id: string
          line_no: number
          quantity_per: number
          scrap_percent: number
        }
        Insert: {
          alternate_group_id?: string | null
          bom_id: string
          child_item_id?: string | null
          created_at?: string
          id?: string
          line_no?: number
          quantity_per: number
          scrap_percent?: number
        }
        Update: {
          alternate_group_id?: string | null
          bom_id?: string
          child_item_id?: string | null
          created_at?: string
          id?: string
          line_no?: number
          quantity_per?: number
          scrap_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "bom_lines_alternate_group_id_fkey"
            columns: ["alternate_group_id"]
            isOneToOne: false
            referencedRelation: "alternate_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_child_item_id_fkey"
            columns: ["child_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      boms: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          notes: string | null
          output_qty: number
          parent_item_id: string
          stage: number
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          notes?: string | null
          output_qty?: number
          parent_item_id: string
          stage?: number
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          notes?: string | null
          output_qty?: number
          parent_item_id?: string
          stage?: number
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boms_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          code: string
          created_at: string
          gstin: string | null
          id: string
          is_plant: boolean
          is_warehouse: boolean
          lat: number | null
          lng: number | null
          name: string
          state_code: string
          status: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          gstin?: string | null
          id?: string
          is_plant?: boolean
          is_warehouse?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          state_code?: string
          status?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          gstin?: string | null
          id?: string
          is_plant?: boolean
          is_warehouse?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          state_code?: string
          status?: string
        }
        Relationships: []
      }
      calendar_days: {
        Row: {
          created_at: string
          date: string
          holiday_name: string | null
          id: string
          is_working: boolean
          notes: string | null
        }
        Insert: {
          created_at?: string
          date: string
          holiday_name?: string | null
          id?: string
          is_working?: boolean
          notes?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          holiday_name?: string | null
          id?: string
          is_working?: boolean
          notes?: string | null
        }
        Relationships: []
      }
      campaign_results: {
        Row: {
          campaign_id: string
          created_at: string
          customer_store_id: string | null
          id: string
          order_id: string | null
          read: boolean
          sent: boolean
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_store_id?: string | null
          id?: string
          order_id?: string | null
          read?: boolean
          sent?: boolean
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_store_id?: string | null
          id?: string
          order_id?: string | null
          read?: boolean
          sent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "campaign_results_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_results_customer_store_id_fkey"
            columns: ["customer_store_id"]
            isOneToOne: false
            referencedRelation: "customer_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_results_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_json: Json
          channel: Database["public"]["Enums"]["campaign_channel"]
          created_at: string
          created_by: string | null
          id: string
          message: string | null
          name: string
          schedule_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string | null
        }
        Insert: {
          audience_json?: Json
          channel?: Database["public"]["Enums"]["campaign_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string | null
          name: string
          schedule_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string | null
        }
        Update: {
          audience_json?: Json
          channel?: Database["public"]["Enums"]["campaign_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string | null
          name?: string
          schedule_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          code: string
          control_of: string | null
          created_at: string
          id: string
          is_postable: boolean
          is_system: boolean
          name: string
          normal_side: Database["public"]["Enums"]["normal_side"]
          parent_id: string | null
          status: string
          type: Database["public"]["Enums"]["account_type"]
        }
        Insert: {
          code: string
          control_of?: string | null
          created_at?: string
          id?: string
          is_postable?: boolean
          is_system?: boolean
          name: string
          normal_side: Database["public"]["Enums"]["normal_side"]
          parent_id?: string | null
          status?: string
          type: Database["public"]["Enums"]["account_type"]
        }
        Update: {
          code?: string
          control_of?: string | null
          created_at?: string
          id?: string
          is_postable?: boolean
          is_system?: boolean
          name?: string
          normal_side?: Database["public"]["Enums"]["normal_side"]
          parent_id?: string | null
          status?: string
          type?: Database["public"]["Enums"]["account_type"]
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cheque_registry: {
        Row: {
          amount: number
          bank_account_id: string | null
          bounce_journal_id: string | null
          bounced_at: string | null
          cheque_date: string | null
          cheque_no: string
          cleared_at: string | null
          created_at: string
          created_by: string | null
          deposited_at: string | null
          direction: Database["public"]["Enums"]["cheque_direction"]
          id: string
          journal_entry_id: string | null
          notes: string | null
          party_id: string | null
          party_type: string | null
          payment_id: string | null
          receipt_id: string | null
          status: Database["public"]["Enums"]["cheque_status"]
          updated_at: string | null
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          bounce_journal_id?: string | null
          bounced_at?: string | null
          cheque_date?: string | null
          cheque_no: string
          cleared_at?: string | null
          created_at?: string
          created_by?: string | null
          deposited_at?: string | null
          direction: Database["public"]["Enums"]["cheque_direction"]
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          party_id?: string | null
          party_type?: string | null
          payment_id?: string | null
          receipt_id?: string | null
          status?: Database["public"]["Enums"]["cheque_status"]
          updated_at?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          bounce_journal_id?: string | null
          bounced_at?: string | null
          cheque_date?: string | null
          cheque_no?: string
          cleared_at?: string | null
          created_at?: string
          created_by?: string | null
          deposited_at?: string | null
          direction?: Database["public"]["Enums"]["cheque_direction"]
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          party_id?: string | null
          party_type?: string | null
          payment_id?: string | null
          receipt_id?: string | null
          status?: Database["public"]["Enums"]["cheque_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cheque_registry_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheque_registry_bounce_journal_id_fkey"
            columns: ["bounce_journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheque_registry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheque_registry_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheque_registry_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "supplier_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheque_registry_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "customer_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_lines: {
        Row: {
          base_amount: number
          basis: Database["public"]["Enums"]["commission_basis"]
          commission_amount: number
          created_at: string
          id: string
          rate: number
          run_id: string
          user_id: string
        }
        Insert: {
          base_amount?: number
          basis: Database["public"]["Enums"]["commission_basis"]
          commission_amount?: number
          created_at?: string
          id?: string
          rate?: number
          run_id: string
          user_id: string
        }
        Update: {
          base_amount?: number
          basis?: Database["public"]["Enums"]["commission_basis"]
          commission_amount?: number
          created_at?: string
          id?: string
          rate?: number
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_lines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "commission_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_lines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          basis: Database["public"]["Enums"]["commission_basis"]
          created_at: string
          created_by: string | null
          id: string
          rate: number
          role_code: string | null
          status: string
          threshold: number
          tier_json: Json
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          basis?: Database["public"]["Enums"]["commission_basis"]
          created_at?: string
          created_by?: string | null
          id?: string
          rate?: number
          role_code?: string | null
          status?: string
          threshold?: number
          tier_json?: Json
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          basis?: Database["public"]["Enums"]["commission_basis"]
          created_at?: string
          created_by?: string | null
          id?: string
          rate?: number
          role_code?: string | null
          status?: string
          threshold?: number
          tier_json?: Json
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "commission_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_runs: {
        Row: {
          computed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          period_month: string
          status: Database["public"]["Enums"]["commission_status"]
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          computed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          period_month: string
          status?: Database["public"]["Enums"]["commission_status"]
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          computed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          period_month?: string
          status?: Database["public"]["Enums"]["commission_status"]
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          base_currency: string
          bis_no: string | null
          created_at: string
          feature_flags: Json
          fssai_no: string | null
          fy_start_month: number
          id: string
          invoice_footer: string | null
          legal_name: string
          pan: string | null
          primary_gstin: string | null
          state_code: string
          trade_name: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          base_currency?: string
          bis_no?: string | null
          created_at?: string
          feature_flags?: Json
          fssai_no?: string | null
          fy_start_month?: number
          id?: string
          invoice_footer?: string | null
          legal_name: string
          pan?: string | null
          primary_gstin?: string | null
          state_code?: string
          trade_name?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          base_currency?: string
          bis_no?: string | null
          created_at?: string
          feature_flags?: Json
          fssai_no?: string | null
          fy_start_month?: number
          id?: string
          invoice_footer?: string | null
          legal_name?: string
          pan?: string | null
          primary_gstin?: string | null
          state_code?: string
          trade_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      complaints: {
        Row: {
          created_at: string
          created_by: string | null
          credit_note_id: string | null
          customer_store_id: string
          id: string
          note: string | null
          resolution: Database["public"]["Enums"]["complaint_resolution"] | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["complaint_status"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit_note_id?: string | null
          customer_store_id: string
          id?: string
          note?: string | null
          resolution?:
            | Database["public"]["Enums"]["complaint_resolution"]
            | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit_note_id?: string | null
          customer_store_id?: string
          id?: string
          note?: string | null
          resolution?:
            | Database["public"]["Enums"]["complaint_resolution"]
            | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_credit_note_fk"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_customer_store_id_fkey"
            columns: ["customer_store_id"]
            isOneToOne: false
            referencedRelation: "customer_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_accounts_tag: {
        Row: {
          account_id: string
          class: Database["public"]["Enums"]["costing_class"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          class: Database["public"]["Enums"]["costing_class"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          class?: Database["public"]["Enums"]["costing_class"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_accounts_tag_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_accounts_tag_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      costing_run_lines: {
        Row: {
          cogm_per_unit: number
          cogm_total: number
          cost_conv: number
          cost_mat: number
          id: string
          item_id: string
          run_id: string
          transferred_in: number
          units: number
        }
        Insert: {
          cogm_per_unit?: number
          cogm_total?: number
          cost_conv?: number
          cost_mat?: number
          id?: string
          item_id: string
          run_id: string
          transferred_in?: number
          units?: number
        }
        Update: {
          cogm_per_unit?: number
          cogm_total?: number
          cost_conv?: number
          cost_mat?: number
          id?: string
          item_id?: string
          run_id?: string
          transferred_in?: number
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "costing_run_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costing_run_lines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "costing_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      costing_runs: {
        Row: {
          cogm_per_unit: number
          computed_at: string
          computed_by: string | null
          conv_equiv_units: number
          cost_conv_per_eu: number
          cost_mat_per_eu: number
          id: string
          mat_equiv_units: number
          period_month: string
          stage: number
          status: string
          transferred_in_per_unit: number | null
          units_completed: number
          wip_units: number
        }
        Insert: {
          cogm_per_unit?: number
          computed_at?: string
          computed_by?: string | null
          conv_equiv_units?: number
          cost_conv_per_eu?: number
          cost_mat_per_eu?: number
          id?: string
          mat_equiv_units?: number
          period_month: string
          stage?: number
          status?: string
          transferred_in_per_unit?: number | null
          units_completed?: number
          wip_units?: number
        }
        Update: {
          cogm_per_unit?: number
          computed_at?: string
          computed_by?: string | null
          conv_equiv_units?: number
          cost_conv_per_eu?: number
          cost_mat_per_eu?: number
          id?: string
          mat_equiv_units?: number
          period_month?: string
          stage?: number
          status?: string
          transferred_in_per_unit?: number | null
          units_completed?: number
          wip_units?: number
        }
        Relationships: [
          {
            foreignKeyName: "costing_runs_computed_by_fkey"
            columns: ["computed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount: number
          approved_by: string | null
          base_amount: number
          complaint_id: string | null
          created_at: string
          created_by: string | null
          credit_note_no: string
          customer_id: string
          customer_store_id: string
          fy_id: string
          id: string
          journal_entry_id: string | null
          narration: string | null
          reason: Database["public"]["Enums"]["credit_note_reason"]
          reference_sale_id: string | null
          scheme_eligibility_id: string | null
          status: Database["public"]["Enums"]["credit_note_status"]
          tax_amount: number
          updated_at: string | null
        }
        Insert: {
          amount: number
          approved_by?: string | null
          base_amount?: number
          complaint_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_no: string
          customer_id: string
          customer_store_id: string
          fy_id: string
          id?: string
          journal_entry_id?: string | null
          narration?: string | null
          reason?: Database["public"]["Enums"]["credit_note_reason"]
          reference_sale_id?: string | null
          scheme_eligibility_id?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"]
          tax_amount?: number
          updated_at?: string | null
        }
        Update: {
          amount?: number
          approved_by?: string | null
          base_amount?: number
          complaint_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_no?: string
          customer_id?: string
          customer_store_id?: string
          fy_id?: string
          id?: string
          journal_entry_id?: string | null
          narration?: string | null
          reason?: Database["public"]["Enums"]["credit_note_reason"]
          reference_sale_id?: string | null
          scheme_eligibility_id?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"]
          tax_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_customer_store_id_fkey"
            columns: ["customer_store_id"]
            isOneToOne: false
            referencedRelation: "customer_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_reference_sale_id_fkey"
            columns: ["reference_sale_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_reference_sale_id_fkey"
            columns: ["reference_sale_id"]
            isOneToOne: false
            referencedRelation: "mv_ar_aging"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "credit_notes_scheme_elig_fk"
            columns: ["scheme_eligibility_id"]
            isOneToOne: false
            referencedRelation: "scheme_eligibility"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          customer_id: string
          customer_store_id: string
          due_date: string | null
          id: string
          reference_id: string
          reference_type: string
          txn_type: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          customer_id: string
          customer_store_id: string
          due_date?: string | null
          id?: string
          reference_id: string
          reference_type: string
          txn_type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          customer_id?: string
          customer_store_id?: string
          due_date?: string | null
          id?: string
          reference_id?: string
          reference_type?: string
          txn_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_customer_store_id_fkey"
            columns: ["customer_store_id"]
            isOneToOne: false
            referencedRelation: "customer_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portal: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_portal_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portal_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_receipts: {
        Row: {
          allocated_amount: number
          amount: number
          collected_by: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          deposit_account: string
          fy_id: string
          id: string
          journal_entry_id: string | null
          method_id: string
          mode: Database["public"]["Enums"]["receipt_mode"]
          notes: string | null
          receipt_date: string
          receipt_no: string
          reference: string | null
          status: string
          store_id: string
        }
        Insert: {
          allocated_amount?: number
          amount: number
          collected_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          deposit_account?: string
          fy_id: string
          id?: string
          journal_entry_id?: string | null
          method_id: string
          mode?: Database["public"]["Enums"]["receipt_mode"]
          notes?: string | null
          receipt_date?: string
          receipt_no: string
          reference?: string | null
          status?: string
          store_id: string
        }
        Update: {
          allocated_amount?: number
          amount?: number
          collected_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deposit_account?: string
          fy_id?: string
          id?: string
          journal_entry_id?: string | null
          method_id?: string
          mode?: Database["public"]["Enums"]["receipt_mode"]
          notes?: string | null
          receipt_date?: string
          receipt_no?: string
          reference?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_receipts_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "customer_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_store_routes: {
        Row: {
          assigned_at: string
          created_by: string | null
          customer_store_id: string
          id: string
          route_id: string
          unassigned_at: string | null
        }
        Insert: {
          assigned_at?: string
          created_by?: string | null
          customer_store_id: string
          id?: string
          route_id: string
          unassigned_at?: string | null
        }
        Update: {
          assigned_at?: string
          created_by?: string | null
          customer_store_id?: string
          id?: string
          route_id?: string
          unassigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_store_routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_store_routes_customer_store_id_fkey"
            columns: ["customer_store_id"]
            isOneToOne: false
            referencedRelation: "customer_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_store_routes_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_stores: {
        Row: {
          address_line: string | null
          area: string | null
          city: string | null
          code: string
          contact_name: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          geo_lat: number | null
          geo_lng: number | null
          id: string
          image_url: string | null
          is_primary: boolean
          kind: Database["public"]["Enums"]["customer_kind"]
          name: string
          phone: string | null
          pincode: string | null
          price_list_id: string | null
          route_id: string | null
          state_code: string
          status: string
          updated_at: string | null
        }
        Insert: {
          address_line?: string | null
          area?: string | null
          city?: string | null
          code: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          image_url?: string | null
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["customer_kind"]
          name: string
          phone?: string | null
          pincode?: string | null
          price_list_id?: string | null
          route_id?: string | null
          state_code?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          address_line?: string | null
          area?: string | null
          city?: string | null
          code?: string
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          image_url?: string | null
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["customer_kind"]
          name?: string
          phone?: string | null
          pincode?: string | null
          price_list_id?: string | null
          route_id?: string | null
          state_code?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_stores_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_stores_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_stores_route_fk"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          credit_days: number
          credit_limit: number
          email: string | null
          gstin: string | null
          id: string
          image_url: string | null
          name: string
          pan: string | null
          phone: string | null
          price_list_id: string | null
          state_code: string
          status: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          credit_days?: number
          credit_limit?: number
          email?: string | null
          gstin?: string | null
          id?: string
          image_url?: string | null
          name: string
          pan?: string | null
          phone?: string | null
          price_list_id?: string | null
          state_code?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          credit_days?: number
          credit_limit?: number
          email?: string | null
          gstin?: string | null
          id?: string
          image_url?: string | null
          name?: string
          pan?: string | null
          phone?: string | null
          price_list_id?: string | null
          state_code?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      debit_note_lines: {
        Row: {
          debit_note_id: string
          gst_rate: number
          id: string
          item_id: string
          line_no: number
          qty: number
          tax_amount: number
          taxable_amount: number
          unit_cost: number
        }
        Insert: {
          debit_note_id: string
          gst_rate?: number
          id?: string
          item_id: string
          line_no: number
          qty: number
          tax_amount?: number
          taxable_amount?: number
          unit_cost?: number
        }
        Update: {
          debit_note_id?: string
          gst_rate?: number
          id?: string
          item_id?: string
          line_no?: number
          qty?: number
          tax_amount?: number
          taxable_amount?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "debit_note_lines_debit_note_id_fkey"
            columns: ["debit_note_id"]
            isOneToOne: false
            referencedRelation: "debit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_note_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      debit_notes: {
        Row: {
          amount: number
          base_amount: number
          branch_id: string | null
          created_at: string
          created_by: string | null
          debit_note_no: string
          fy_id: string
          id: string
          journal_entry_id: string | null
          narration: string | null
          purchase_bill_id: string | null
          reason: Database["public"]["Enums"]["debit_note_reason"]
          status: Database["public"]["Enums"]["debit_note_status"]
          supplier_id: string
          tax_amount: number
        }
        Insert: {
          amount: number
          base_amount?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          debit_note_no: string
          fy_id: string
          id?: string
          journal_entry_id?: string | null
          narration?: string | null
          purchase_bill_id?: string | null
          reason?: Database["public"]["Enums"]["debit_note_reason"]
          status?: Database["public"]["Enums"]["debit_note_status"]
          supplier_id: string
          tax_amount?: number
        }
        Update: {
          amount?: number
          base_amount?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          debit_note_no?: string
          fy_id?: string
          id?: string
          journal_entry_id?: string | null
          narration?: string | null
          purchase_bill_id?: string | null
          reason?: Database["public"]["Enums"]["debit_note_reason"]
          status?: Database["public"]["Enums"]["debit_note_status"]
          supplier_id?: string
          tax_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "debit_notes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_challan_lines: {
        Row: {
          challan_id: string
          id: string
          item_id: string
          line_no: number
          order_line_id: string
          qty: number
        }
        Insert: {
          challan_id: string
          id?: string
          item_id: string
          line_no?: number
          order_line_id: string
          qty: number
        }
        Update: {
          challan_id?: string
          id?: string
          item_id?: string
          line_no?: number
          order_line_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_challan_lines_challan_id_fkey"
            columns: ["challan_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challan_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challan_lines_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_challans: {
        Row: {
          agent_id: string | null
          branch_id: string
          challan_no: string
          cogs_entry_id: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          dispatched_at: string | null
          eway_bill_no: string | null
          fy_id: string
          id: string
          journal_entry_id: string | null
          notes: string | null
          order_id: string
          printed_at: string
          status: Database["public"]["Enums"]["challan_status"]
        }
        Insert: {
          agent_id?: string | null
          branch_id: string
          challan_no: string
          cogs_entry_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          dispatched_at?: string | null
          eway_bill_no?: string | null
          fy_id: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          order_id: string
          printed_at?: string
          status?: Database["public"]["Enums"]["challan_status"]
        }
        Update: {
          agent_id?: string | null
          branch_id?: string
          challan_no?: string
          cogs_entry_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          dispatched_at?: string | null
          eway_bill_no?: string | null
          fy_id?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          order_id?: string
          printed_at?: string
          status?: Database["public"]["Enums"]["challan_status"]
        }
        Relationships: [
          {
            foreignKeyName: "delivery_challans_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_cogs_entry_id_fkey"
            columns: ["cogs_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      depreciation_lines: {
        Row: {
          amount: number
          asset_id: string
          id: string
          run_id: string
          wdv_after: number
          wdv_before: number
        }
        Insert: {
          amount: number
          asset_id: string
          id?: string
          run_id: string
          wdv_after?: number
          wdv_before?: number
        }
        Update: {
          amount?: number
          asset_id?: string
          id?: string
          run_id?: string
          wdv_after?: number
          wdv_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_lines_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_lines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "depreciation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      depreciation_runs: {
        Row: {
          created_at: string
          created_by: string | null
          fy_id: string
          id: string
          journal_entry_id: string | null
          period_label: string | null
          run_date: string
          run_no: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fy_id: string
          id?: string
          journal_entry_id?: string | null
          period_label?: string | null
          run_date: string
          run_no: string
          total_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fy_id?: string
          id?: string
          journal_entry_id?: string | null
          period_label?: string | null
          run_date?: string
          run_no?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_runs_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_bucket: string
          storage_path: string
          tags: string[]
          title: string
          updated_at: string | null
          uploaded_by: string | null
          visibility: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path: string
          tags?: string[]
          title: string
          updated_at?: string | null
          uploaded_by?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path?: string
          tags?: string[]
          title?: string
          updated_at?: string | null
          uploaded_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_profiles: {
        Row: {
          aadhar_number: string | null
          address: string | null
          created_at: string
          id: string
          phone: string | null
          photo_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aadhar_number?: string | null
          address?: string | null
          created_at?: string
          id?: string
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aadhar_number?: string | null
          address?: string | null
          created_at?: string
          id?: string
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_serials: {
        Row: {
          entity_type: string
          next_val: number
          pad_width: number
          prefix: string
        }
        Insert: {
          entity_type: string
          next_val?: number
          pad_width?: number
          prefix: string
        }
        Update: {
          entity_type?: string
          next_val?: number
          pad_width?: number
          prefix?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          account_code: string
          amount: number
          approved_at: string | null
          approved_by: string | null
          bill_url: string | null
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string | null
          expense_date: string
          expense_no: string
          fy_id: string
          id: string
          journal_id: string | null
          note: string | null
          reject_reason: string | null
          rejected_at: string | null
          rejected_by: string | null
          source: Database["public"]["Enums"]["expense_source"]
          status: Database["public"]["Enums"]["expense_status"]
          user_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          account_code: string
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          bill_url?: string | null
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          expense_date: string
          expense_no: string
          fy_id: string
          id?: string
          journal_id?: string | null
          note?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          source: Database["public"]["Enums"]["expense_source"]
          status?: Database["public"]["Enums"]["expense_status"]
          user_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          account_code?: string
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bill_url?: string | null
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          expense_date?: string
          expense_no?: string
          fy_id?: string
          id?: string
          journal_id?: string | null
          note?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          source?: Database["public"]["Enums"]["expense_source"]
          status?: Database["public"]["Enums"]["expense_status"]
          user_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "expenses_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "mv_trial_balance"
            referencedColumns: ["account_code"]
          },
          {
            foreignKeyName: "expenses_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_years: {
        Row: {
          code: string
          created_at: string
          end_date: string
          id: string
          start_date: string
          status: Database["public"]["Enums"]["fy_status"]
        }
        Insert: {
          code: string
          created_at?: string
          end_date: string
          id?: string
          start_date: string
          status?: Database["public"]["Enums"]["fy_status"]
        }
        Update: {
          code?: string
          created_at?: string
          end_date?: string
          id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["fy_status"]
        }
        Relationships: []
      }
      fixed_assets: {
        Row: {
          accum_dep_account: string
          asset_account: string
          asset_class: Database["public"]["Enums"]["asset_class"]
          asset_no: string
          capitalize_journal_id: string | null
          capitalized_value: number
          created_at: string
          created_by: string | null
          dep_expense_account: string
          dep_rate: number | null
          disposal_journal_id: string | null
          disposed_on: string | null
          fy_id: string
          id: string
          method: Database["public"]["Enums"]["dep_method"]
          name: string
          note: string | null
          purchase_date: string
          salvage_value: number
          status: Database["public"]["Enums"]["asset_status"]
          useful_life_years: number | null
        }
        Insert: {
          accum_dep_account?: string
          asset_account: string
          asset_class: Database["public"]["Enums"]["asset_class"]
          asset_no: string
          capitalize_journal_id?: string | null
          capitalized_value: number
          created_at?: string
          created_by?: string | null
          dep_expense_account: string
          dep_rate?: number | null
          disposal_journal_id?: string | null
          disposed_on?: string | null
          fy_id: string
          id?: string
          method?: Database["public"]["Enums"]["dep_method"]
          name: string
          note?: string | null
          purchase_date: string
          salvage_value?: number
          status?: Database["public"]["Enums"]["asset_status"]
          useful_life_years?: number | null
        }
        Update: {
          accum_dep_account?: string
          asset_account?: string
          asset_class?: Database["public"]["Enums"]["asset_class"]
          asset_no?: string
          capitalize_journal_id?: string | null
          capitalized_value?: number
          created_at?: string
          created_by?: string | null
          dep_expense_account?: string
          dep_rate?: number | null
          disposal_journal_id?: string | null
          disposed_on?: string | null
          fy_id?: string
          id?: string
          method?: Database["public"]["Enums"]["dep_method"]
          name?: string
          note?: string | null
          purchase_date?: string
          salvage_value?: number
          status?: Database["public"]["Enums"]["asset_status"]
          useful_life_years?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_accum_dep_account_fkey"
            columns: ["accum_dep_account"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fixed_assets_accum_dep_account_fkey"
            columns: ["accum_dep_account"]
            isOneToOne: false
            referencedRelation: "mv_trial_balance"
            referencedColumns: ["account_code"]
          },
          {
            foreignKeyName: "fixed_assets_asset_account_fkey"
            columns: ["asset_account"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fixed_assets_asset_account_fkey"
            columns: ["asset_account"]
            isOneToOne: false
            referencedRelation: "mv_trial_balance"
            referencedColumns: ["account_code"]
          },
          {
            foreignKeyName: "fixed_assets_capitalize_journal_id_fkey"
            columns: ["capitalize_journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_dep_expense_account_fkey"
            columns: ["dep_expense_account"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fixed_assets_dep_expense_account_fkey"
            columns: ["dep_expense_account"]
            isOneToOne: false
            referencedRelation: "mv_trial_balance"
            referencedColumns: ["account_code"]
          },
          {
            foreignKeyName: "fixed_assets_disposal_journal_id_fkey"
            columns: ["disposal_journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_logs: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          expense_id: string | null
          id: string
          journal_entry_id: string | null
          litres: number
          log_date: string
          odometer: number | null
          trip_id: string | null
          vehicle_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          id?: string
          journal_entry_id?: string | null
          litres: number
          log_date?: string
          odometer?: number | null
          trip_id?: string | null
          vehicle_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          id?: string
          journal_entry_id?: string | null
          litres?: number
          log_date?: string
          odometer?: number | null
          trip_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_logs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_logs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_refill_events: {
        Row: {
          admin_amount: number | null
          admin_litres: number | null
          created_at: string
          delta_litres: number
          detected_at: string
          event_type: string
          fraud_alert: boolean
          fuel_log_id: string | null
          id: string
          new_amount: number
          prev_amount: number
          receipt_url: string | null
          status: string
          vehicle_id: string
        }
        Insert: {
          admin_amount?: number | null
          admin_litres?: number | null
          created_at?: string
          delta_litres: number
          detected_at?: string
          event_type: string
          fraud_alert?: boolean
          fuel_log_id?: string | null
          id?: string
          new_amount: number
          prev_amount: number
          receipt_url?: string | null
          status?: string
          vehicle_id: string
        }
        Update: {
          admin_amount?: number | null
          admin_litres?: number | null
          created_at?: string
          delta_litres?: number
          detected_at?: string
          event_type?: string
          fraud_alert?: boolean
          fuel_log_id?: string | null
          id?: string
          new_amount?: number
          prev_amount?: number
          receipt_url?: string | null
          status?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_refill_events_fuel_log_id_fkey"
            columns: ["fuel_log_id"]
            isOneToOne: false
            referencedRelation: "fuel_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_refill_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      gstr2b_imports: {
        Row: {
          filename: string | null
          id: string
          imported_at: string
          imported_by: string | null
          note: string | null
          period: string
          row_count: number
        }
        Insert: {
          filename?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          note?: string | null
          period: string
          row_count?: number
        }
        Update: {
          filename?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          note?: string | null
          period?: string
          row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "gstr2b_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gstr2b_rows: {
        Row: {
          cess: number
          cgst: number
          created_at: string
          id: string
          igst: number
          import_id: string
          invoice_date: string | null
          invoice_no: string | null
          match_status: Database["public"]["Enums"]["gst_match_status"]
          matched_bill_id: string | null
          sgst: number
          supplier_gstin: string | null
          taxable: number
        }
        Insert: {
          cess?: number
          cgst?: number
          created_at?: string
          id?: string
          igst?: number
          import_id: string
          invoice_date?: string | null
          invoice_no?: string | null
          match_status?: Database["public"]["Enums"]["gst_match_status"]
          matched_bill_id?: string | null
          sgst?: number
          supplier_gstin?: string | null
          taxable?: number
        }
        Update: {
          cess?: number
          cgst?: number
          created_at?: string
          id?: string
          igst?: number
          import_id?: string
          invoice_date?: string | null
          invoice_no?: string | null
          match_status?: Database["public"]["Enums"]["gst_match_status"]
          matched_bill_id?: string | null
          sgst?: number
          supplier_gstin?: string | null
          taxable?: number
        }
        Relationships: [
          {
            foreignKeyName: "gstr2b_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "gstr2b_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gstr2b_rows_matched_bill_id_fkey"
            columns: ["matched_bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          by_user_id: string | null
          created_at: string
          customer_store_id: string | null
          id: string
          lead_id: string | null
          note: string | null
          type: Database["public"]["Enums"]["interaction_type"]
        }
        Insert: {
          by_user_id?: string | null
          created_at?: string
          customer_store_id?: string | null
          id?: string
          lead_id?: string | null
          note?: string | null
          type?: Database["public"]["Enums"]["interaction_type"]
        }
        Update: {
          by_user_id?: string | null
          created_at?: string
          customer_store_id?: string | null
          id?: string
          lead_id?: string | null
          note?: string | null
          type?: Database["public"]["Enums"]["interaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "interactions_by_user_id_fkey"
            columns: ["by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_customer_store_id_fkey"
            columns: ["customer_store_id"]
            isOneToOne: false
            referencedRelation: "customer_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          cess_amount: number
          cgst_amount: number
          gst_rate: number
          id: string
          igst_amount: number
          invoice_id: string
          item_id: string
          line_no: number
          line_total: number
          qty: number
          sgst_amount: number
          taxable_amount: number
          unit_cogs: number | null
          unit_price: number
        }
        Insert: {
          cess_amount?: number
          cgst_amount?: number
          gst_rate: number
          id?: string
          igst_amount?: number
          invoice_id: string
          item_id: string
          line_no?: number
          line_total: number
          qty: number
          sgst_amount?: number
          taxable_amount: number
          unit_cogs?: number | null
          unit_price: number
        }
        Update: {
          cess_amount?: number
          cgst_amount?: number
          gst_rate?: number
          id?: string
          igst_amount?: number
          invoice_id?: string
          item_id?: string
          line_no?: number
          line_total?: number
          qty?: number
          sgst_amount?: number
          taxable_amount?: number
          unit_cogs?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "mv_ar_aging"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          branch_id: string
          cess_amount: number
          cgst_amount: number
          cogs_entry_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          fy_id: string
          grand_total: number
          id: string
          igst_amount: number
          invoice_date: string
          invoice_no: string
          is_interstate: boolean
          is_official: boolean
          journal_entry_id: string | null
          order_id: string | null
          place_of_supply: string
          round_off: number
          sgst_amount: number
          status: Database["public"]["Enums"]["invoice_status"]
          store_id: string
          taxable_amount: number
        }
        Insert: {
          amount_paid?: number
          branch_id: string
          cess_amount?: number
          cgst_amount?: number
          cogs_entry_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          fy_id: string
          grand_total?: number
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_no: string
          is_interstate?: boolean
          is_official?: boolean
          journal_entry_id?: string | null
          order_id?: string | null
          place_of_supply: string
          round_off?: number
          sgst_amount?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          store_id: string
          taxable_amount?: number
        }
        Update: {
          amount_paid?: number
          branch_id?: string
          cess_amount?: number
          cgst_amount?: number
          cogs_entry_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          fy_id?: string
          grand_total?: number
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_no?: string
          is_interstate?: boolean
          is_official?: boolean
          journal_entry_id?: string | null
          order_id?: string | null
          place_of_supply?: string
          round_off?: number
          sgst_amount?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          store_id?: string
          taxable_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_cogs_entry_id_fkey"
            columns: ["cogs_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "customer_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      issued_numbers: {
        Row: {
          created_at: string
          doc_number: string
          doc_type: string
        }
        Insert: {
          created_at?: string
          doc_number: string
          doc_type: string
        }
        Update: {
          created_at?: string
          doc_number?: string
          doc_type?: string
        }
        Relationships: []
      }
      item_categories: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      item_suppliers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          item_id: string
          lead_time_days: number
          min_order_qty: number
          preferred: boolean
          supplier_id: string
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          item_id: string
          lead_time_days?: number
          min_order_qty?: number
          preferred?: boolean
          supplier_id: string
          unit_price?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          item_id?: string
          lead_time_days?: number
          min_order_qty?: number
          preferred?: boolean
          supplier_id?: string
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_suppliers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          base_unit_id: string
          category_id: string | null
          cess_rate: number
          created_at: string
          created_by: string | null
          default_price: number
          gst_rate: number
          hsn_code: string | null
          id: string
          is_purchasable: boolean
          is_sellable: boolean
          is_stocked: boolean
          name: string
          pack_size: number
          pack_unit_id: string | null
          reorder_level: number
          sku: string
          status: string
          type: Database["public"]["Enums"]["item_type"]
          updated_at: string | null
        }
        Insert: {
          base_unit_id: string
          category_id?: string | null
          cess_rate?: number
          created_at?: string
          created_by?: string | null
          default_price?: number
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          is_purchasable?: boolean
          is_sellable?: boolean
          is_stocked?: boolean
          name: string
          pack_size?: number
          pack_unit_id?: string | null
          reorder_level?: number
          sku: string
          status?: string
          type: Database["public"]["Enums"]["item_type"]
          updated_at?: string | null
        }
        Update: {
          base_unit_id?: string
          category_id?: string | null
          cess_rate?: number
          created_at?: string
          created_by?: string | null
          default_price?: number
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          is_purchasable?: boolean
          is_sellable?: boolean
          is_stocked?: boolean
          name?: string
          pack_size?: number
          pack_unit_id?: string | null
          reorder_level?: number
          sku?: string
          status?: string
          type?: Database["public"]["Enums"]["item_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_pack_unit_id_fkey"
            columns: ["pack_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          entry_date: string
          entry_no: string
          fy_id: string
          id: string
          narration: string | null
          posted_at: string
          posted_by: string | null
          reverses_id: string | null
          source: string
          source_id: string | null
          status: Database["public"]["Enums"]["entry_status"]
        }
        Insert: {
          created_at?: string
          entry_date: string
          entry_no: string
          fy_id: string
          id?: string
          narration?: string | null
          posted_at?: string
          posted_by?: string | null
          reverses_id?: string | null
          source: string
          source_id?: string | null
          status?: Database["public"]["Enums"]["entry_status"]
        }
        Update: {
          created_at?: string
          entry_date?: string
          entry_no?: string
          fy_id?: string
          id?: string
          narration?: string | null
          posted_at?: string
          posted_by?: string | null
          reverses_id?: string | null
          source?: string
          source_id?: string | null
          status?: Database["public"]["Enums"]["entry_status"]
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          branch_id: string | null
          cost_center_id: string | null
          credit: number
          debit: number
          entry_id: string
          id: string
          memo: string | null
          party_id: string | null
          party_type: string | null
          stock_item_id: string | null
          stock_qty: number
        }
        Insert: {
          account_id: string
          branch_id?: string | null
          cost_center_id?: string | null
          credit?: number
          debit?: number
          entry_id: string
          id?: string
          memo?: string | null
          party_id?: string | null
          party_type?: string | null
          stock_item_id?: string | null
          stock_qty?: number
        }
        Update: {
          account_id?: string
          branch_id?: string | null
          cost_center_id?: string | null
          credit?: number
          debit?: number
          entry_id?: string
          id?: string
          memo?: string | null
          party_id?: string | null
          party_type?: string | null
          stock_item_id?: string | null
          stock_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_stock_item_fk"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          company: string | null
          converted_customer_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          follow_up_date: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          company?: string | null
          converted_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          follow_up_date?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          company?: string | null
          converted_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          follow_up_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_customer_id_fkey"
            columns: ["converted_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          created_at: string
          created_by: string | null
          document_url: string | null
          expiry_date: string
          id: string
          issued_date: string | null
          issuing_authority: string | null
          license_no: string
          notes: string | null
          renewal_reminder_days: number
          status: Database["public"]["Enums"]["license_status"]
          type: Database["public"]["Enums"]["license_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          expiry_date: string
          id?: string
          issued_date?: string | null
          issuing_authority?: string | null
          license_no: string
          notes?: string | null
          renewal_reminder_days?: number
          status?: Database["public"]["Enums"]["license_status"]
          type: Database["public"]["Enums"]["license_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_url?: string | null
          expiry_date?: string
          id?: string
          issued_date?: string | null
          issuing_authority?: string | null
          license_no?: string
          notes?: string | null
          renewal_reminder_days?: number
          status?: Database["public"]["Enums"]["license_status"]
          type?: Database["public"]["Enums"]["license_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_schedule: {
        Row: {
          balance: number
          due_date: string
          emi_amount: number
          id: string
          installment_no: number
          interest_component: number
          loan_id: string
          paid: boolean
          paid_on: string | null
          payment_journal_id: string | null
          principal_component: number
        }
        Insert: {
          balance: number
          due_date: string
          emi_amount: number
          id?: string
          installment_no: number
          interest_component: number
          loan_id: string
          paid?: boolean
          paid_on?: string | null
          payment_journal_id?: string | null
          principal_component: number
        }
        Update: {
          balance?: number
          due_date?: string
          emi_amount?: number
          id?: string
          installment_no?: number
          interest_component?: number
          loan_id?: string
          paid?: boolean
          paid_on?: string | null
          payment_journal_id?: string | null
          principal_component?: number
        }
        Relationships: [
          {
            foreignKeyName: "loan_schedule_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_schedule_payment_journal_id_fkey"
            columns: ["payment_journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          annual_rate: number
          created_at: string
          created_by: string | null
          disburse_journal_id: string | null
          emi_amount: number
          fy_id: string
          id: string
          interest_account: string
          lender: string
          loan_account: string
          loan_no: string
          note: string | null
          principal: number
          start_date: string
          status: Database["public"]["Enums"]["loan_status"]
          tenure_months: number
        }
        Insert: {
          annual_rate: number
          created_at?: string
          created_by?: string | null
          disburse_journal_id?: string | null
          emi_amount: number
          fy_id: string
          id?: string
          interest_account?: string
          lender: string
          loan_account?: string
          loan_no: string
          note?: string | null
          principal: number
          start_date: string
          status?: Database["public"]["Enums"]["loan_status"]
          tenure_months: number
        }
        Update: {
          annual_rate?: number
          created_at?: string
          created_by?: string | null
          disburse_journal_id?: string | null
          emi_amount?: number
          fy_id?: string
          id?: string
          interest_account?: string
          lender?: string
          loan_account?: string
          loan_no?: string
          note?: string | null
          principal?: number
          start_date?: string
          status?: Database["public"]["Enums"]["loan_status"]
          tenure_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "loans_disburse_journal_id_fkey"
            columns: ["disburse_journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_interest_account_fkey"
            columns: ["interest_account"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "loans_interest_account_fkey"
            columns: ["interest_account"]
            isOneToOne: false
            referencedRelation: "mv_trial_balance"
            referencedColumns: ["account_code"]
          },
          {
            foreignKeyName: "loans_loan_account_fkey"
            columns: ["loan_account"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "loans_loan_account_fkey"
            columns: ["loan_account"]
            isOneToOne: false
            referencedRelation: "mv_trial_balance"
            referencedColumns: ["account_code"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: string
          channel: Database["public"]["Enums"]["notification_channel"]
          enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          channel: Database["public"]["Enums"]["notification_channel"]
          enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          category: string | null
          created_at: string
          created_by: string | null
          delivery_channel: Database["public"]["Enums"]["notification_channel"]
          entity_id: string | null
          entity_type: string | null
          id: string
          read_at: string | null
          sent_at: string | null
          sent_external: boolean
          severity: Database["public"]["Enums"]["notification_severity"]
          status: Database["public"]["Enums"]["notification_status"]
          title: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          delivery_channel?: Database["public"]["Enums"]["notification_channel"]
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          sent_external?: boolean
          severity?: Database["public"]["Enums"]["notification_severity"]
          status?: Database["public"]["Enums"]["notification_status"]
          title: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          delivery_channel?: Database["public"]["Enums"]["notification_channel"]
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          sent_external?: boolean
          severity?: Database["public"]["Enums"]["notification_severity"]
          status?: Database["public"]["Enums"]["notification_status"]
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      number_series: {
        Row: {
          doc_type: string
          fy_id: string
          id: string
          next_val: number
          pad_width: number
          prefix: string
          reset: Database["public"]["Enums"]["number_reset"]
          updated_at: string | null
        }
        Insert: {
          doc_type: string
          fy_id: string
          id?: string
          next_val?: number
          pad_width?: number
          prefix?: string
          reset?: Database["public"]["Enums"]["number_reset"]
          updated_at?: string | null
        }
        Update: {
          doc_type?: string
          fy_id?: string
          id?: string
          next_val?: number
          pad_width?: number
          prefix?: string
          reset?: Database["public"]["Enums"]["number_reset"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "number_series_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
        ]
      }
      overhead_pools: {
        Row: {
          allocation_driver: string
          amount: number
          created_at: string
          created_by: string | null
          id: string
          name: string
          period_month: string
          source: string
          stage: string
        }
        Insert: {
          allocation_driver?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          period_month: string
          source?: string
          stage?: string
        }
        Update: {
          allocation_driver?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          period_month?: string
          source?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "overhead_pools_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_mappings: {
        Row: {
          amount: number
          created_at: string
          hours_max: number
          hours_min: number
          id: string
        }
        Insert: {
          amount: number
          created_at?: string
          hours_max: number
          hours_min: number
          id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          hours_max?: number
          hours_min?: number
          id?: string
        }
        Relationships: []
      }
      payment_allocations: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          id: string
          payment_id: string
        }
        Insert: {
          amount: number
          bill_id: string
          created_at?: string
          id?: string
          payment_id: string
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string
          id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "supplier_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          matched_receipt_id: string | null
          mode: string
          note: string | null
          reference: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          matched_receipt_id?: string | null
          mode: string
          note?: string | null
          reference?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          matched_receipt_id?: string | null
          mode?: string
          note?: string | null
          reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_matched_receipt_id_fkey"
            columns: ["matched_receipt_id"]
            isOneToOne: false
            referencedRelation: "customer_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          code: string
          destination: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          destination: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          destination?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      payroll_lines: {
        Row: {
          created_at: string
          days_present: number
          gross: number
          id: string
          net: number
          ot_hours: number
          paid_amount: number
          paid_journal_id: string | null
          run_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_present?: number
          gross?: number
          id?: string
          net?: number
          ot_hours?: number
          paid_amount?: number
          paid_journal_id?: string | null
          run_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          days_present?: number
          gross?: number
          id?: string
          net?: number
          ot_hours?: number
          paid_amount?: number
          paid_journal_id?: string | null
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_lines_paid_journal_id_fkey"
            columns: ["paid_journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_lines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_lines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          computed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          period_month: string
          status: Database["public"]["Enums"]["payroll_status"]
          total_gross: number
          updated_at: string | null
        }
        Insert: {
          computed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          period_month: string
          status?: Database["public"]["Enums"]["payroll_status"]
          total_gross?: number
          updated_at?: string | null
        }
        Update: {
          computed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          period_month?: string
          status?: Database["public"]["Enums"]["payroll_status"]
          total_gross?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          description: string | null
        }
        Insert: {
          code: string
          description?: string | null
        }
        Update: {
          code?: string
          description?: string | null
        }
        Relationships: []
      }
      price_list_items: {
        Row: {
          item_id: string
          min_qty: number
          price_list_id: string
          unit_price: number
        }
        Insert: {
          item_id: string
          min_qty?: number
          price_list_id: string
          unit_price: number
        }
        Update: {
          item_id?: string
          min_qty?: number
          price_list_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          code: string
          created_at: string
          currency: string
          id: string
          is_default: boolean
          name: string
          status: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          id?: string
          is_default?: boolean
          name: string
          status?: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          id?: string
          is_default?: boolean
          name?: string
          status?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: []
      }
      product_cost_snapshots: {
        Row: {
          cogm_per_case: number
          item_id: string
          loaded_per_case: number
          period_month: string
          source_run_id: string | null
          updated_at: string
        }
        Insert: {
          cogm_per_case?: number
          item_id: string
          loaded_per_case?: number
          period_month: string
          source_run_id?: string | null
          updated_at?: string
        }
        Update: {
          cogm_per_case?: number
          item_id?: string
          loaded_per_case?: number
          period_month?: string
          source_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_cost_snapshots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_cost_snapshots_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "costing_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_device_config: {
        Row: {
          created_at: string
          device_id: string
          device_index: number
          id: string
          item_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          device_id: string
          device_index: number
          id?: string
          item_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string
          device_index?: number
          id?: string
          item_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_device_config_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      production_job_cards: {
        Row: {
          assigned_to: string | null
          branch_id: string
          card_date: string
          created_at: string
          created_by: string
          device_id: string | null
          fy_id: string
          id: string
          instructions: string | null
          job_no: string
          output_item_id: string
          planned_end_at: string | null
          planned_start_at: string | null
          run_id: string | null
          stage: number
          status: Database["public"]["Enums"]["job_card_status"]
          target_qty: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          branch_id: string
          card_date: string
          created_at?: string
          created_by: string
          device_id?: string | null
          fy_id: string
          id?: string
          instructions?: string | null
          job_no: string
          output_item_id: string
          planned_end_at?: string | null
          planned_start_at?: string | null
          run_id?: string | null
          stage: number
          status?: Database["public"]["Enums"]["job_card_status"]
          target_qty: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          branch_id?: string
          card_date?: string
          created_at?: string
          created_by?: string
          device_id?: string | null
          fy_id?: string
          id?: string
          instructions?: string | null
          job_no?: string
          output_item_id?: string
          planned_end_at?: string | null
          planned_start_at?: string | null
          run_id?: string | null
          stage?: number
          status?: Database["public"]["Enums"]["job_card_status"]
          target_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_job_cards_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_job_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_job_cards_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "production_device_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_job_cards_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_job_cards_output_item_id_fkey"
            columns: ["output_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_job_cards_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_logs: {
        Row: {
          device_id: string
          device_index: number
          id: string
          logged_at: string
          quantity: number
          synced_at: string
        }
        Insert: {
          device_id: string
          device_index: number
          id?: string
          logged_at: string
          quantity?: number
          synced_at?: string
        }
        Update: {
          device_id?: string
          device_index?: number
          id?: string
          logged_at?: string
          quantity?: number
          synced_at?: string
        }
        Relationships: []
      }
      production_run_inputs: {
        Row: {
          id: string
          item_id: string
          line_no: number
          qty: number
          run_id: string
          unit_cost: number
          value: number
        }
        Insert: {
          id?: string
          item_id: string
          line_no?: number
          qty: number
          run_id: string
          unit_cost: number
          value: number
        }
        Update: {
          id?: string
          item_id?: string
          line_no?: number
          qty?: number
          run_id?: string
          unit_cost?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_run_inputs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_run_inputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "production_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_runs: {
        Row: {
          abnormal_wastage_value: number
          branch_id: string
          created_at: string
          created_by: string | null
          fy_id: string
          id: string
          input_value: number
          journal_run_id: string | null
          notes: string | null
          output_item_id: string
          output_qty: number
          output_unit_cost: number
          run_date: string
          run_no: string
          stage: number
          status: Database["public"]["Enums"]["production_status"]
        }
        Insert: {
          abnormal_wastage_value?: number
          branch_id: string
          created_at?: string
          created_by?: string | null
          fy_id: string
          id?: string
          input_value?: number
          journal_run_id?: string | null
          notes?: string | null
          output_item_id: string
          output_qty: number
          output_unit_cost?: number
          run_date?: string
          run_no: string
          stage?: number
          status?: Database["public"]["Enums"]["production_status"]
        }
        Update: {
          abnormal_wastage_value?: number
          branch_id?: string
          created_at?: string
          created_by?: string | null
          fy_id?: string
          id?: string
          input_value?: number
          journal_run_id?: string | null
          notes?: string | null
          output_item_id?: string
          output_qty?: number
          output_unit_cost?: number
          run_date?: string
          run_no?: string
          stage?: number
          status?: Database["public"]["Enums"]["production_status"]
        }
        Relationships: [
          {
            foreignKeyName: "production_runs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_runs_output_item_id_fkey"
            columns: ["output_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          gst_rate: number
          id: string
          item_id: string
          line_no: number
          po_id: string
          qty: number
          unit_cost: number
        }
        Insert: {
          gst_rate: number
          id?: string
          item_id: string
          line_no?: number
          po_id: string
          qty: number
          unit_cost: number
        }
        Update: {
          gst_rate?: number
          id?: string
          item_id?: string
          line_no?: number
          po_id?: string
          qty?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          expected_date: string | null
          fy_id: string
          id: string
          notes: string | null
          po_date: string
          po_no: string
          status: Database["public"]["Enums"]["purchase_status"]
          supplier_id: string
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          fy_id: string
          id?: string
          notes?: string | null
          po_date?: string
          po_no: string
          status?: Database["public"]["Enums"]["purchase_status"]
          supplier_id: string
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          fy_id?: string
          id?: string
          notes?: string | null
          po_date?: string
          po_no?: string
          status?: Database["public"]["Enums"]["purchase_status"]
          supplier_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipt_lines: {
        Row: {
          grn_id: string
          gst_rate: number
          id: string
          item_id: string
          line_no: number
          line_value: number
          qty: number
          unit_cost: number
        }
        Insert: {
          grn_id: string
          gst_rate: number
          id?: string
          item_id: string
          line_no?: number
          line_value: number
          qty: number
          unit_cost: number
        }
        Update: {
          grn_id?: string
          gst_rate?: number
          id?: string
          item_id?: string
          line_no?: number
          line_value?: number
          qty?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipt_lines_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipts: {
        Row: {
          billed_bill_id: string | null
          branch_id: string
          created_at: string
          created_by: string | null
          fy_id: string
          goods_value: number
          grn_date: string
          grn_no: string
          id: string
          journal_entry_id: string | null
          notes: string | null
          po_id: string | null
          status: Database["public"]["Enums"]["grn_status"]
          supplier_dc_no: string | null
          supplier_id: string
        }
        Insert: {
          billed_bill_id?: string | null
          branch_id: string
          created_at?: string
          created_by?: string | null
          fy_id: string
          goods_value?: number
          grn_date?: string
          grn_no: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          po_id?: string | null
          status?: Database["public"]["Enums"]["grn_status"]
          supplier_dc_no?: string | null
          supplier_id: string
        }
        Update: {
          billed_bill_id?: string | null
          branch_id?: string
          created_at?: string
          created_by?: string | null
          fy_id?: string
          goods_value?: number
          grn_date?: string
          grn_no?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          po_id?: string | null
          status?: Database["public"]["Enums"]["grn_status"]
          supplier_dc_no?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          receipt_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          receipt_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "mv_ar_aging"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "receipt_allocations_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "customer_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_adjustments: {
        Row: {
          adj_date: string
          adj_type: Database["public"]["Enums"]["bank_adj_type"]
          amount: number
          bank_account_id: string
          bank_transaction_id: string | null
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          narration: string | null
        }
        Insert: {
          adj_date?: string
          adj_type: Database["public"]["Enums"]["bank_adj_type"]
          amount: number
          bank_account_id: string
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          narration?: string | null
        }
        Update: {
          adj_date?: string
          adj_type?: Database["public"]["Enums"]["bank_adj_type"]
          amount?: number
          bank_account_id?: string
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          narration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_adjustments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_adjustments_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_adjustments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          role_id: string
          scope: string
        }
        Insert: {
          permission: string
          role_id: string
          scope?: string
        }
        Update: {
          permission?: string
          role_id?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      route_sessions: {
        Row: {
          agent_id: string
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          paused_at: string | null
          resumed_at: string | null
          route_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["route_session_status"]
          stores_completed: number
          stores_planned: number
          total_distance_km: number
          total_duration_min: number
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          paused_at?: string | null
          resumed_at?: string | null
          route_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["route_session_status"]
          stores_completed?: number
          stores_planned?: number
          total_distance_km?: number
          total_duration_min?: number
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          paused_at?: string | null
          resumed_at?: string | null
          route_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["route_session_status"]
          stores_completed?: number
          stores_planned?: number
          total_distance_km?: number
          total_duration_min?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_sessions_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_lines: {
        Row: {
          gst_rate: number
          id: string
          item_id: string
          line_no: number
          order_id: string
          qty: number
          qty_fulfilled: number
          unit_price: number
        }
        Insert: {
          gst_rate: number
          id?: string
          item_id: string
          line_no?: number
          order_id: string
          qty: number
          qty_fulfilled?: number
          unit_price: number
        }
        Update: {
          gst_rate?: number
          id?: string
          item_id?: string
          line_no?: number
          order_id?: string
          qty?: number
          qty_fulfilled?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          followup_order_id: string | null
          fy_id: string
          id: string
          notes: string | null
          order_date: string
          order_no: string
          parent_order_id: string | null
          price_list_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          updated_at: string | null
          version: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          followup_order_id?: string | null
          fy_id: string
          id?: string
          notes?: string | null
          order_date?: string
          order_no: string
          parent_order_id?: string | null
          price_list_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          updated_at?: string | null
          version?: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          followup_order_id?: string | null
          fy_id?: string
          id?: string
          notes?: string | null
          order_date?: string
          order_no?: string
          parent_order_id?: string | null
          price_list_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_followup_order_id_fkey"
            columns: ["followup_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "customer_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_return_lines: {
        Row: {
          credit_note_id: string
          id: string
          invoice_id: string
          invoice_line_id: string
          item_id: string
          line_no: number
          qty: number
          tax_amount: number
          taxable_amount: number
          unit_cogs: number
        }
        Insert: {
          credit_note_id: string
          id?: string
          invoice_id: string
          invoice_line_id: string
          item_id: string
          line_no: number
          qty: number
          tax_amount?: number
          taxable_amount?: number
          unit_cogs?: number
        }
        Update: {
          credit_note_id?: string
          id?: string
          invoice_id?: string
          invoice_line_id?: string
          item_id?: string
          line_no?: number
          qty?: number
          tax_amount?: number
          taxable_amount?: number
          unit_cogs?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_lines_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "mv_ar_aging"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "sales_return_lines_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_targets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          period_month: string
          target_amount: number
          target_cases: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          period_month: string
          target_amount?: number
          target_cases?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          period_month?: string
          target_amount?: number
          target_cases?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scheme_eligibility: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          credit_note_id: string | null
          customer_store_id: string
          id: string
          rebate_amount: number
          scheme_id: string
          status: Database["public"]["Enums"]["scheme_eligibility_status"]
          tier_achieved: number | null
          total_volume: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          credit_note_id?: string | null
          customer_store_id: string
          id?: string
          rebate_amount?: number
          scheme_id: string
          status?: Database["public"]["Enums"]["scheme_eligibility_status"]
          tier_achieved?: number | null
          total_volume?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          credit_note_id?: string | null
          customer_store_id?: string
          id?: string
          rebate_amount?: number
          scheme_id?: string
          status?: Database["public"]["Enums"]["scheme_eligibility_status"]
          tier_achieved?: number | null
          total_volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "scheme_eligibility_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheme_eligibility_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheme_eligibility_customer_store_id_fkey"
            columns: ["customer_store_id"]
            isOneToOne: false
            referencedRelation: "customer_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheme_eligibility_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      schemes: {
        Row: {
          created_at: string
          created_by: string | null
          eligibility: string
          gst_adjusted: boolean
          gst_rate: number
          id: string
          name: string
          notes: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["scheme_status"]
          target_type: string
          tiers_json: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          eligibility?: string
          gst_adjusted?: boolean
          gst_rate?: number
          id?: string
          name: string
          notes?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["scheme_status"]
          target_type?: string
          tiers_json?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          eligibility?: string
          gst_adjusted?: boolean
          gst_rate?: number
          id?: string
          name?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["scheme_status"]
          target_type?: string
          tiers_json?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schemes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_templates: {
        Row: {
          created_at: string
          end_time: string
          id: string
          name: string
          start_time: string
          total_hours: number
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          name: string
          start_time: string
          total_hours: number
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          name?: string
          start_time?: string
          total_hours?: number
        }
        Relationships: []
      }
      stock: {
        Row: {
          avg_cost: number
          branch_id: string
          item_id: string
          qty_on_hand: number
          updated_at: string
        }
        Insert: {
          avg_cost?: number
          branch_id: string
          item_id: string
          qty_on_hand?: number
          updated_at?: string
        }
        Update: {
          avg_cost?: number
          branch_id?: string
          item_id?: string
          qty_on_hand?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_ledger: {
        Row: {
          avg_after: number
          branch_id: string
          id: string
          item_id: string
          journal_entry_id: string | null
          move_type: Database["public"]["Enums"]["stock_move_type"]
          moved_at: string
          moved_by: string | null
          qty_after: number
          qty_delta: number
          source: string | null
          source_id: string | null
          unit_cost: number
          value_delta: number
        }
        Insert: {
          avg_after: number
          branch_id: string
          id?: string
          item_id: string
          journal_entry_id?: string | null
          move_type: Database["public"]["Enums"]["stock_move_type"]
          moved_at?: string
          moved_by?: string | null
          qty_after: number
          qty_delta: number
          source?: string | null
          source_id?: string | null
          unit_cost: number
          value_delta: number
        }
        Update: {
          avg_after?: number
          branch_id?: string
          id?: string
          item_id?: string
          journal_entry_id?: string | null
          move_type?: Database["public"]["Enums"]["stock_move_type"]
          moved_at?: string
          moved_by?: string | null
          qty_after?: number
          qty_delta?: number
          source?: string | null
          source_id?: string | null
          unit_cost?: number
          value_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_moved_by_fkey"
            columns: ["moved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_bill_lines: {
        Row: {
          bill_id: string
          cess_amount: number
          cgst_amount: number
          description: string | null
          expense_account: string | null
          gst_rate: number
          id: string
          igst_amount: number
          item_id: string | null
          line_no: number
          line_total: number
          qty: number
          sgst_amount: number
          taxable_amount: number
          unit_cost: number
        }
        Insert: {
          bill_id: string
          cess_amount?: number
          cgst_amount?: number
          description?: string | null
          expense_account?: string | null
          gst_rate: number
          id?: string
          igst_amount?: number
          item_id?: string | null
          line_no?: number
          line_total: number
          qty?: number
          sgst_amount?: number
          taxable_amount: number
          unit_cost: number
        }
        Update: {
          bill_id?: string
          cess_amount?: number
          cgst_amount?: number
          description?: string | null
          expense_account?: string | null
          gst_rate?: number
          id?: string
          igst_amount?: number
          item_id?: string | null
          line_no?: number
          line_total?: number
          qty?: number
          sgst_amount?: number
          taxable_amount?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bill_lines_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bill_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_bills: {
        Row: {
          amount_paid: number
          bill_date: string
          bill_no: string
          branch_id: string
          cess_amount: number
          cgst_amount: number
          created_at: string
          created_by: string | null
          due_date: string | null
          fy_id: string
          grand_total: number
          id: string
          igst_amount: number
          is_interstate: boolean
          journal_entry_id: string | null
          notes: string | null
          round_off: number
          sgst_amount: number
          status: Database["public"]["Enums"]["bill_status"]
          supplier_bill_no: string | null
          supplier_id: string
          taxable_amount: number
        }
        Insert: {
          amount_paid?: number
          bill_date?: string
          bill_no: string
          branch_id: string
          cess_amount?: number
          cgst_amount?: number
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          fy_id: string
          grand_total?: number
          id?: string
          igst_amount?: number
          is_interstate?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          round_off?: number
          sgst_amount?: number
          status?: Database["public"]["Enums"]["bill_status"]
          supplier_bill_no?: string | null
          supplier_id: string
          taxable_amount?: number
        }
        Update: {
          amount_paid?: number
          bill_date?: string
          bill_no?: string
          branch_id?: string
          cess_amount?: number
          cgst_amount?: number
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          fy_id?: string
          grand_total?: number
          id?: string
          igst_amount?: number
          is_interstate?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          round_off?: number
          sgst_amount?: number
          status?: Database["public"]["Enums"]["bill_status"]
          supplier_bill_no?: string | null
          supplier_id?: string
          taxable_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bills_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          allocated_amount: number
          amount: number
          created_at: string
          created_by: string | null
          fy_id: string
          id: string
          journal_entry_id: string | null
          mode: Database["public"]["Enums"]["payment_mode"]
          notes: string | null
          paid_by: string | null
          payment_date: string
          payment_no: string
          reference: string | null
          source_account: string
          status: string
          supplier_id: string
        }
        Insert: {
          allocated_amount?: number
          amount: number
          created_at?: string
          created_by?: string | null
          fy_id: string
          id?: string
          journal_entry_id?: string | null
          mode: Database["public"]["Enums"]["payment_mode"]
          notes?: string | null
          paid_by?: string | null
          payment_date?: string
          payment_no: string
          reference?: string | null
          source_account?: string
          status?: string
          supplier_id: string
        }
        Update: {
          allocated_amount?: number
          amount?: number
          created_at?: string
          created_by?: string | null
          fy_id?: string
          id?: string
          journal_entry_id?: string | null
          mode?: Database["public"]["Enums"]["payment_mode"]
          notes?: string | null
          paid_by?: string | null
          payment_date?: string
          payment_no?: string
          reference?: string | null
          source_account?: string
          status?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address_line: string | null
          city: string | null
          code: string
          created_at: string
          created_by: string | null
          credit_days: number
          email: string | null
          gstin: string | null
          id: string
          kind: Database["public"]["Enums"]["supplier_kind"]
          name: string
          notes: string | null
          pan: string | null
          payment_terms: string | null
          phone: string | null
          pincode: string | null
          state_code: string
          status: string
          updated_at: string | null
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          credit_days?: number
          email?: string | null
          gstin?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["supplier_kind"]
          name: string
          notes?: string | null
          pan?: string | null
          payment_terms?: string | null
          phone?: string | null
          pincode?: string | null
          state_code?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          address_line?: string | null
          city?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          credit_days?: number
          email?: string | null
          gstin?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["supplier_kind"]
          name?: string
          notes?: string | null
          pan?: string | null
          payment_terms?: string | null
          phone?: string | null
          pincode?: string | null
          state_code?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_lines: {
        Row: {
          batch_no: string | null
          id: string
          item_id: string
          qty: number
          transfer_id: string
        }
        Insert: {
          batch_no?: string | null
          id?: string
          item_id: string
          qty: number
          transfer_id: string
        }
        Update: {
          batch_no?: string | null
          id?: string
          item_id?: string
          qty?: number
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_lines_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string
          deposit_account: string | null
          from_branch_id: string | null
          from_user_id: string | null
          fy_id: string
          id: string
          journal_entry_id: string | null
          note: string | null
          reference_order_id: string | null
          responded_at: string | null
          responded_by: string | null
          status: string
          to_branch_id: string | null
          to_user_id: string | null
          transfer_no: string
          type: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by: string
          deposit_account?: string | null
          from_branch_id?: string | null
          from_user_id?: string | null
          fy_id: string
          id?: string
          journal_entry_id?: string | null
          note?: string | null
          reference_order_id?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          to_branch_id?: string | null
          to_user_id?: string | null
          transfer_no: string
          type: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string
          deposit_account?: string | null
          from_branch_id?: string | null
          from_user_id?: string | null
          fy_id?: string
          id?: string
          journal_entry_id?: string | null
          note?: string | null
          reference_order_id?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          to_branch_id?: string | null
          to_user_id?: string | null
          transfer_no?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_reference_order_id_fkey"
            columns: ["reference_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          avg_speed: number | null
          category: string | null
          created_at: string
          created_by: string | null
          distance_km: number | null
          driver_user_id: string | null
          end_km: number | null
          end_lat: number | null
          end_lng: number | null
          ended_at: string | null
          id: string
          max_speed: number | null
          notes: string | null
          route_session_id: string | null
          start_km: number | null
          start_lat: number | null
          start_lng: number | null
          started_at: string | null
          status: string
          trip_date: string
          type: string
          vehicle_id: string
        }
        Insert: {
          avg_speed?: number | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          distance_km?: number | null
          driver_user_id?: string | null
          end_km?: number | null
          end_lat?: number | null
          end_lng?: number | null
          ended_at?: string | null
          id?: string
          max_speed?: number | null
          notes?: string | null
          route_session_id?: string | null
          start_km?: number | null
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string | null
          status?: string
          trip_date?: string
          type?: string
          vehicle_id: string
        }
        Update: {
          avg_speed?: number | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          distance_km?: number | null
          driver_user_id?: string | null
          end_km?: number | null
          end_lat?: number | null
          end_lng?: number | null
          ended_at?: string | null
          id?: string
          max_speed?: number | null
          notes?: string | null
          route_session_id?: string | null
          start_km?: number | null
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string | null
          status?: string
          trip_date?: string
          type?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_user_id_fkey"
            columns: ["driver_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_route_session_id_fkey"
            columns: ["route_session_id"]
            isOneToOne: false
            referencedRelation: "route_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_cash_holdings: {
        Row: {
          amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cash_holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          branch_id: string | null
          consumed_at: string | null
          consumed_by: string | null
          created_at: string
          email: string | null
          expires_at: string
          full_name: string
          id: string
          invited_by: string | null
          phone: string
          role_codes: string[]
          status: string
        }
        Insert: {
          branch_id?: string | null
          consumed_at?: string | null
          consumed_by?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          full_name: string
          id?: string
          invited_by?: string | null
          phone: string
          role_codes?: string[]
          status?: string
        }
        Update: {
          branch_id?: string | null
          consumed_at?: string | null
          consumed_by?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          full_name?: string
          id?: string
          invited_by?: string | null
          phone?: string
          role_codes?: string[]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_consumed_by_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_pay_config: {
        Row: {
          commission_basis: string | null
          commission_rate: number
          daily_rate: number
          effective_from: string
          exclude_from_payroll: boolean
          id: string
          monthly_salary: number
          ot_hourly_rate: number
          paid_leaves: number
          pay_type: string
          standard_shift_hrs: number
          user_id: string | null
          worker_id: string | null
        }
        Insert: {
          commission_basis?: string | null
          commission_rate?: number
          daily_rate?: number
          effective_from?: string
          exclude_from_payroll?: boolean
          id: string
          monthly_salary?: number
          ot_hourly_rate?: number
          paid_leaves?: number
          pay_type?: string
          standard_shift_hrs?: number
          user_id?: string | null
          worker_id?: string | null
        }
        Update: {
          commission_basis?: string | null
          commission_rate?: number
          daily_rate?: number
          effective_from?: string
          exclude_from_payroll?: boolean
          id?: string
          monthly_salary?: number
          ot_hourly_rate?: number
          paid_leaves?: number
          pay_type?: string
          standard_shift_hrs?: number
          user_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_pay_config_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_pay_config_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          created_at: string
          effect: string
          expires_at: string | null
          granted_by: string | null
          permission: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          effect: string
          expires_at?: string | null
          granted_by?: string | null
          permission: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          effect?: string
          expires_at?: string | null
          granted_by?: string | null
          permission?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          role_id: string
          user_id: string
        }
        Insert: {
          role_id: string
          user_id: string
        }
        Update: {
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stock_holdings: {
        Row: {
          avg_cost: number
          batch_no: string | null
          id: string
          item_id: string
          qty: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_cost?: number
          batch_no?: string | null
          id?: string
          item_id: string
          qty?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_cost?: number
          batch_no?: string | null
          id?: string
          item_id?: string
          qty?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_stock_holdings_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_stock_holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          branch_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          status: string
          token_version: number
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          phone?: string | null
          status?: string
          token_version?: number
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          status?: string
          token_version?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_gps_logs: {
        Row: {
          created_at: string
          fuel_amount: number | null
          fuel_pct: number | null
          heading: number | null
          id: number
          ignition: boolean | null
          lat: number | null
          lng: number | null
          recorded_at: string
          speed: number | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          fuel_amount?: number | null
          fuel_pct?: number | null
          heading?: number | null
          id?: never
          ignition?: boolean | null
          lat?: number | null
          lng?: number | null
          recorded_at: string
          speed?: number | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          fuel_amount?: number | null
          fuel_pct?: number | null
          heading?: number | null
          id?: never
          ignition?: boolean | null
          lat?: number | null
          lng?: number | null
          recorded_at?: string
          speed?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_gps_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          capacity: string | null
          created_at: string
          created_by: string | null
          id: string
          linked_asset_id: string | null
          owned_or_hired: Database["public"]["Enums"]["vehicle_ownership"]
          reg_no: string
          status: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          capacity?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          linked_asset_id?: string | null
          owned_or_hired?: Database["public"]["Enums"]["vehicle_ownership"]
          reg_no: string
          status?: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          capacity?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          linked_asset_id?: string | null
          owned_or_hired?: Database["public"]["Enums"]["vehicle_ownership"]
          reg_no?: string
          status?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          agent_id: string
          created_at: string
          customer_store_id: string
          duration_min: number
          id: string
          lat: number | null
          lng: number | null
          no_business_note: string | null
          no_business_reason: string | null
          route_session_id: string
          visit_type: Database["public"]["Enums"]["visit_type"]
          visited_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          customer_store_id: string
          duration_min?: number
          id?: string
          lat?: number | null
          lng?: number | null
          no_business_note?: string | null
          no_business_reason?: string | null
          route_session_id: string
          visit_type?: Database["public"]["Enums"]["visit_type"]
          visited_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          customer_store_id?: string
          duration_min?: number
          id?: string
          lat?: number | null
          lng?: number | null
          no_business_note?: string | null
          no_business_reason?: string | null
          route_session_id?: string
          visit_type?: Database["public"]["Enums"]["visit_type"]
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_customer_store_id_fkey"
            columns: ["customer_store_id"]
            isOneToOne: false
            referencedRelation: "customer_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_route_session_id_fkey"
            columns: ["route_session_id"]
            isOneToOne: false
            referencedRelation: "route_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_templates: {
        Row: {
          created_at: string
          created_by: string | null
          default_lines_json: Json
          id: string
          name: string
          notes: string | null
          updated_at: string | null
          voucher_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_lines_json?: Json
          id?: string
          name: string
          notes?: string | null
          updated_at?: string | null
          voucher_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_lines_json?: Json
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string | null
          voucher_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          access_token_encrypted: string | null
          default_template: string | null
          dry_run: boolean
          id: number
          meta_app_id: string | null
          phone_number_id: string | null
          registered_at: string | null
          updated_at: string | null
          updated_by: string | null
          verify_token: string | null
          waba_id: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          default_template?: string | null
          dry_run?: boolean
          id?: number
          meta_app_id?: string | null
          phone_number_id?: string | null
          registered_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
          verify_token?: string | null
          waba_id?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          default_template?: string | null
          dry_run?: boolean
          id?: number
          meta_app_id?: string | null
          phone_number_id?: string | null
          registered_at?: string | null
          updated_at?: string | null
          updated_by?: string | null
          verify_token?: string | null
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_store_id: string | null
          id: string
          last_message_at: string | null
          last_read_at: string | null
          phone: string
          status: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_store_id?: string | null
          id?: string
          last_message_at?: string | null
          last_read_at?: string | null
          phone: string
          status?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_store_id?: string | null
          id?: string
          last_message_at?: string | null
          last_read_at?: string | null
          phone?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_customer_store_id_fkey"
            columns: ["customer_store_id"]
            isOneToOne: false
            referencedRelation: "customer_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_message_templates: {
        Row: {
          body_text: string
          category: string
          created_at: string
          id: string
          language: string
          name: string
          status: string
          user_id: string
        }
        Insert: {
          body_text: string
          category?: string
          created_at?: string
          id?: string
          language?: string
          name: string
          status?: string
          user_id: string
        }
        Update: {
          body_text?: string
          category?: string
          created_at?: string
          id?: string
          language?: string
          name?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          direction: string
          error_message: string | null
          id: string
          media_filename: string | null
          media_mime: string | null
          media_url: string | null
          msg_type: string
          sent_by: string | null
          status: string | null
          template_name: string | null
          template_params: Json | null
          whatsapp_message_id: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          error_message?: string | null
          id?: string
          media_filename?: string | null
          media_mime?: string | null
          media_url?: string | null
          msg_type?: string
          sent_by?: string | null
          status?: string | null
          template_name?: string | null
          template_params?: Json | null
          whatsapp_message_id?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          error_message?: string | null
          id?: string
          media_filename?: string | null
          media_mime?: string | null
          media_url?: string | null
          msg_type?: string
          sent_by?: string | null
          status?: string | null
          template_name?: string | null
          template_params?: Json | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          reference_id: string | null
          transaction_date: string
          type: string
          user_id: string | null
          worker_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          reference_id?: string | null
          transaction_date: string
          type?: string
          user_id?: string | null
          worker_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          reference_id?: string | null
          transaction_date?: string
          type?: string
          user_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_transactions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          aadhar_number: string | null
          address: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          photo_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          aadhar_number?: string | null
          address?: string | null
          created_at?: string
          full_name: string
          id?: string
          phone?: string | null
          photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          aadhar_number?: string | null
          address?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          photo_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      mv_ar_aging: {
        Row: {
          age_days: number | null
          amount_paid: number | null
          branch_id: string | null
          bucket: string | null
          customer_id: string | null
          grand_total: number | null
          invoice_date: string | null
          invoice_id: string | null
          invoice_no: string | null
          outstanding: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_trial_balance: {
        Row: {
          account_code: string | null
          account_id: string | null
          account_name: string | null
          account_type: Database["public"]["Enums"]["account_type"] | null
          balance: number | null
          credit_total: number | null
          debit_total: number | null
          fy_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_balances_fy_id_fkey"
            columns: ["fy_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_value_reconcile: {
        Row: {
          difference: number | null
          inv_account: string | null
          ledger_value: number | null
          stock_carrying_value: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _bump_user_cash: {
        Args: { p_delta: number; p_user: string }
        Returns: undefined
      }
      _expense_source_account: {
        Args: { p_source: Database["public"]["Enums"]["expense_source"] }
        Returns: string
      }
      _post_credit_note: {
        Args: {
          p_amount: number
          p_opts?: Json
          p_reason: Database["public"]["Enums"]["credit_note_reason"]
          p_store: string
        }
        Returns: string
      }
      _random_digits: { Args: { p_len: number }; Returns: string }
      _random_token: { Args: { p_len: number }; Returns: string }
      _user_commission_base: {
        Args: {
          p_basis: Database["public"]["Enums"]["commission_basis"]
          p_from: string
          p_to: string
          p_user: string
        }
        Returns: number
      }
      _user_stock_in: {
        Args: { p_cost: number; p_item: string; p_qty: number; p_user: string }
        Returns: undefined
      }
      _user_stock_out: {
        Args: { p_item: string; p_qty: number; p_user: string }
        Returns: number
      }
      active_bom_for: {
        Args: { p_as_of?: string; p_item: string }
        Returns: string
      }
      admin_create_role: {
        Args: { p_code: string; p_name: string }
        Returns: string
      }
      admin_create_user: {
        Args: {
          p_branch_id?: string
          p_email?: string
          p_full_name: string
          p_phone: string
          p_role_codes?: string[]
        }
        Returns: string
      }
      admin_enable_customer_portal: {
        Args: {
          p_active?: boolean
          p_contact_phone?: string
          p_customer_id: string
        }
        Returns: string
      }
      admin_revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      admin_set_user_status: {
        Args: { p_reason?: string; p_status: string; p_user: string }
        Returns: undefined
      }
      approve_expense: { Args: { p_id: string }; Returns: string }
      approve_order: { Args: { p_order_id: string }; Returns: string }
      archive_notifications: { Args: { p_ids?: string[] }; Returns: number }
      assert_identity_integrity: {
        Args: never
        Returns: {
          detail: string
          id: string
          issue: string
        }[]
      }
      assert_trial_balance: { Args: { p_fy?: string }; Returns: number }
      asset_wdv: { Args: { p_asset: string }; Returns: number }
      assign_role: {
        Args: { p_role_code: string; p_user: string }
        Returns: undefined
      }
      bank_reconciliation: {
        Args: { p_as_on?: string; p_bank_account: string }
        Returns: {
          book_balance: number
          difference: number
          matched_count: number
          statement_balance: number
          unmatched_stmt_count: number
          unmatched_stmt_value: number
        }[]
      }
      bill_outstanding: { Args: { p_bill: string }; Returns: number }
      bom_standard_cost: {
        Args: { p_as_of?: string; p_item: string; p_output_units?: number }
        Returns: number
      }
      bounce_cheque: {
        Args: { p_cheque: string; p_reason?: string }
        Returns: string
      }
      bump_token_version: { Args: { p_user: string }; Returns: undefined }
      calc_scheme_eligibility: { Args: { p_scheme: string }; Returns: number }
      cancel_order: {
        Args: { p_order: string; p_reason?: string }
        Returns: string
      }
      cancel_transfer: { Args: { p_id: string }; Returns: string }
      check_credit_limit: {
        Args: { p_customer_id: string; p_order_value: number }
        Returns: Json
      }
      cleanup_orphan_google_user: { Args: never; Returns: boolean }
      close_partial_order: {
        Args: { p_order: string; p_reason?: string }
        Returns: string
      }
      compute_commissions: { Args: { p_month: string }; Returns: string }
      compute_loaded_cost: { Args: { p_month: string }; Returns: undefined }
      compute_payroll: { Args: { p_month: string }; Returns: string }
      convert_invoice_type: {
        Args: { p_invoice: string; p_reason?: string }
        Returns: string
      }
      convert_lead: {
        Args: { p_customer?: Json; p_lead: string; p_store?: Json }
        Returns: string
      }
      costing_untagged_accounts: {
        Args: { p_month: string }
        Returns: {
          code: string
          name: string
        }[]
      }
      create_challan: {
        Args: { p_header: Json; p_lines?: Json }
        Returns: string
      }
      create_fixed_asset: { Args: { p_header: Json }; Returns: string }
      create_loan: { Args: { p_header: Json }; Returns: string }
      create_transfer: {
        Args: { p_header: Json; p_lines?: Json }
        Returns: string
      }
      current_app_user: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      customer_activity: {
        Args: {
          p_customer: string
          p_from?: string
          p_store?: string
          p_to?: string
        }
        Returns: {
          credit: number
          debit: number
          description: string
          event_date: string
          event_ts: string
          kind: string
          ref_id: string
          ref_no: string
          status: string
          store_id: string
          store_name: string
        }[]
      }
      customer_opening_balance: {
        Args: {
          p_amount: number
          p_as_of?: string
          p_customer: string
          p_narration?: string
        }
        Returns: string
      }
      customer_outstanding: { Args: { p_customer: string }; Returns: number }
      customer_outstanding_via_ledger: {
        Args: { p_customer_id: string }
        Returns: number
      }
      dispose_fixed_asset: {
        Args: {
          p_asset: string
          p_date?: string
          p_proceeds: number
          p_recv_account?: string
        }
        Returns: string
      }
      effective_price: {
        Args: { p_item: string; p_price_list: string; p_qty?: number }
        Returns: number
      }
      explode_bom: {
        Args: { p_as_of?: string; p_item: string; p_output_units?: number }
        Returns: {
          child_item_id: string
          gross_qty: number
        }[]
      }
      fy_for_date: { Args: { p_date: string }; Returns: string }
      generate_gst_invoice: {
        Args: { p_date?: string; p_order: string }
        Returns: string
      }
      get_ar_aging: {
        Args: { p_branch?: string }
        Returns: {
          age_days: number | null
          amount_paid: number | null
          branch_id: string | null
          bucket: string | null
          customer_id: string | null
          grand_total: number | null
          invoice_date: string | null
          invoice_id: string | null
          invoice_no: string | null
          outstanding: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mv_ar_aging"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_customer_ledger: {
        Args: { p_customer_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          invoice_no: string
          receipt_no: string
          reference_id: string
          reference_type: string
          txn_type: string
        }[]
      }
      get_hourly_production: {
        Args: { p_date: string }
        Returns: {
          device_id: string
          device_index: number
          hour: number
          item_name: string
          item_sku: string
          item_type: string
          total: number
        }[]
      }
      get_my_permissions: { Args: never; Returns: string[] }
      get_my_token_version: { Args: never; Returns: number }
      get_person_balance: { Args: { p_entity_id: string }; Returns: number }
      get_trial_balance: {
        Args: { p_fy: string }
        Returns: {
          account_code: string | null
          account_id: string | null
          account_name: string | null
          account_type: Database["public"]["Enums"]["account_type"] | null
          balance: number | null
          credit_total: number | null
          debit_total: number | null
          fy_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mv_trial_balance"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_worker_balance: { Args: { p_user_id: string }; Returns: number }
      grant_user_permission: {
        Args: {
          p_code: string
          p_effect?: string
          p_expires_at?: string
          p_reason?: string
          p_user: string
        }
        Returns: undefined
      }
      has_permission: { Args: { p_code: string }; Returns: boolean }
      import_bank_statement: {
        Args: { p_bank_account: string; p_opts?: Json; p_rows: Json }
        Returns: Json
      }
      import_gstr2b: {
        Args: { p_filename: string; p_period: string; p_rows: Json }
        Returns: string
      }
      insert_production_log: {
        Args: {
          p_device_id: string
          p_device_index: number
          p_logged_at?: string
          p_quantity?: number
        }
        Returns: string
      }
      insert_production_logs_batch: { Args: { p_logs: Json }; Returns: Json }
      inventory_account_for: {
        Args: { p_type: Database["public"]["Enums"]["item_type"] }
        Returns: string
      }
      invitation_for_phone: { Args: { p_phone: string }; Returns: boolean }
      invoice_outstanding: { Args: { p_invoice: string }; Returns: number }
      is_portal_principal: { Args: never; Returns: boolean }
      license_expiry_scan: {
        Args: never
        Returns: {
          days_to_expiry: number
          expiry_date: string
          id: string
          is_expired: boolean
          license_no: string
          type: Database["public"]["Enums"]["license_type"]
        }[]
      }
      licenses_due: {
        Args: { p_as_of?: string }
        Returns: {
          days_to_expiry: number
          expiry_date: string
          id: string
          is_expired: boolean
          license_no: string
          type: Database["public"]["Enums"]["license_type"]
        }[]
      }
      link_store_to_customer: {
        Args: { p_customer: string; p_store: string }
        Returns: string
      }
      list_payroll_people: {
        Args: never
        Returns: {
          aadhar_number: string
          address: string
          entity_id: string
          entity_type: string
          full_name: string
          phone: string
          photo_url: string
        }[]
      }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      match_bank_txn: {
        Args: { p_target: Json; p_txn: string }
        Returns: string
      }
      month_bounds: {
        Args: { p_month: string }
        Returns: Record<string, unknown>
      }
      next_device_index: { Args: { p_device_id: string }; Returns: number }
      next_entity_code: { Args: { p_entity_type: string }; Returns: string }
      next_number: {
        Args: { p_date?: string; p_doc_type: string }
        Returns: string
      }
      notification_daily_scan: { Args: never; Returns: Json }
      notify: {
        Args: { p_opts?: Json; p_title: string; p_user: string }
        Returns: string
      }
      notify_by_permission: {
        Args: { p_code: string; p_opts?: Json; p_title: string }
        Returns: number
      }
      notify_perm: {
        Args: { p_code: string; p_opts?: Json; p_title: string }
        Returns: number
      }
      pay_emi: {
        Args: { p_date?: string; p_pay_account?: string; p_schedule: string }
        Returns: string
      }
      pay_payroll_line: {
        Args: { p_line: string; p_pay_from?: string }
        Returns: string
      }
      pay_supplier: {
        Args: { p_allocations?: Json; p_header: Json }
        Returns: string
      }
      perms_for_user: { Args: { p_user: string }; Returns: string[] }
      place_order: { Args: { p_header: Json; p_lines: Json }; Returns: string }
      place_purchase_order: {
        Args: { p_header: Json; p_lines: Json }
        Returns: string
      }
      portal_catalog: {
        Args: never
        Returns: {
          default_price: number
          gst_rate: number
          id: string
          name: string
          qty_on_hand: number
          sku: string
        }[]
      }
      portal_create_order: {
        Args: { p_lines: Json; p_notes?: string; p_store_id: string }
        Returns: string
      }
      portal_customer_id: { Args: never; Returns: string }
      portal_my_documents: {
        Args: never
        Returns: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          mime_type: string
          size_bytes: number
          title: string
          uploaded_by: string
          visibility: string
        }[]
      }
      portal_my_invoices: {
        Args: { p_status?: string }
        Returns: {
          amount_paid: number
          due: number
          grand_total: number
          id: string
          invoice_date: string
          invoice_no: string
          status: string
          store_code: string
          store_name: string
          tax_total: number
          taxable_amount: number
        }[]
      }
      portal_my_orders: {
        Args: never
        Returns: {
          created_at: string
          id: string
          notes: string
          order_date: string
          order_no: string
          status: string
          store_code: string
          store_name: string
        }[]
      }
      portal_my_pay_intents: {
        Args: never
        Returns: {
          amount: number
          created_at: string
          id: string
          mode: string
          reference: string
          status: string
        }[]
      }
      portal_my_profile: {
        Args: never
        Returns: {
          code: string
          customer_id: string
          email: string
          gstin: string
          name: string
          outstanding: number
          phone: string
          store_count: number
        }[]
      }
      portal_my_statement: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          invoice_no: string
          receipt_no: string
          reference_id: string
          reference_type: string
          store_name: string
          txn_type: string
        }[]
      }
      portal_my_stores: {
        Args: never
        Returns: {
          city: string
          code: string
          id: string
          is_primary: boolean
          kind: Database["public"]["Enums"]["customer_kind"]
          name: string
        }[]
      }
      portal_submit_pay_intent: {
        Args: {
          p_amount: number
          p_mode: string
          p_note?: string
          p_reference?: string
        }
        Returns: string
      }
      post_bill_from_grn: {
        Args: { p_date?: string; p_grn: string; p_supplier_bill_no?: string }
        Returns: string
      }
      post_commission_run: { Args: { p_run: string }; Returns: string }
      post_complaint_credit_note: {
        Args: { p_amount: number; p_complaint: string; p_opts?: Json }
        Returns: string
      }
      post_delivery: { Args: { p_order: string }; Returns: string }
      post_fuel_log: { Args: { p_header: Json }; Returns: string }
      post_grn: { Args: { p_header: Json; p_lines: Json }; Returns: string }
      post_grn_from_po: {
        Args: { p_date?: string; p_po: string }
        Returns: string
      }
      post_invoice: { Args: { p_header: Json; p_lines: Json }; Returns: string }
      post_invoice_from_order: {
        Args: {
          p_date?: string
          p_is_official?: boolean
          p_lines?: Json
          p_order: string
        }
        Returns: string
      }
      post_journal: { Args: { p_header: Json; p_lines: Json }; Returns: string }
      post_payroll_run: { Args: { p_run: string }; Returns: string }
      post_production_run: {
        Args: { p_header: Json; p_inputs?: Json }
        Returns: string
      }
      post_reconciliation_adjustment: {
        Args: {
          p_amount: number
          p_bank_account: string
          p_kind: Database["public"]["Enums"]["bank_adj_type"]
          p_opts?: Json
        }
        Returns: string
      }
      post_scheme_credit_note: {
        Args: { p_eligibility: string }
        Returns: string
      }
      post_stock_move: {
        Args: {
          p_branch: string
          p_contra_account?: string
          p_entry_date?: string
          p_item: string
          p_move_type: Database["public"]["Enums"]["stock_move_type"]
          p_qty: number
          p_source?: string
          p_source_id?: string
          p_unit_cost?: number
        }
        Returns: string
      }
      post_supplier_bill: {
        Args: { p_header: Json; p_lines: Json }
        Returns: string
      }
      post_voucher: { Args: { p_header: Json; p_lines: Json }; Returns: string }
      pref_allows: {
        Args: {
          p_category: string
          p_channel: Database["public"]["Enums"]["notification_channel"]
          p_user: string
        }
        Returns: boolean
      }
      previous_customer_balance: {
        Args: { p_customer_id: string }
        Returns: number
      }
      rebuild_account_balances: { Args: { p_fy?: string }; Returns: undefined }
      rebuild_customer_ledger: {
        Args: { p_customer_id?: string }
        Returns: string
      }
      rebuild_user_cash_holdings: { Args: never; Returns: number }
      receive_opening_stock: {
        Args: {
          p_as_of?: string
          p_branch: string
          p_item: string
          p_qty: number
          p_unit_cost: number
        }
        Returns: string
      }
      receive_opening_stock_batch: {
        Args: { p_as_of?: string; p_lines: Json }
        Returns: number
      }
      reconcile_gstr2b: { Args: { p_import: string }; Returns: number }
      reconcile_payment_intent: {
        Args: {
          p_deposit_account?: string
          p_intent_id: string
          p_method_id: string
          p_receipt_date?: string
          p_store_id: string
        }
        Returns: string
      }
      record_expense: { Args: { p_header: Json }; Returns: string }
      record_purchase_return: {
        Args: { p_lines: Json; p_opts?: Json; p_supplier: string }
        Returns: string
      }
      record_receipt: {
        Args: { p_allocations?: Json; p_header: Json }
        Returns: string
      }
      record_sales_return: {
        Args: { p_invoice: string; p_lines: Json; p_opts?: Json }
        Returns: string
      }
      refresh_read_models: { Args: never; Returns: undefined }
      register_cheque: { Args: { p_header: Json }; Returns: string }
      reject_expense: {
        Args: { p_id: string; p_reason?: string }
        Returns: string
      }
      resolve_bom_child: {
        Args: { p_line: Database["public"]["Tables"]["bom_lines"]["Row"] }
        Returns: string
      }
      resolve_price_list: { Args: { p_store: string }; Returns: string }
      resolve_price_list_for_portal: { Args: never; Returns: string }
      resolve_recipients: { Args: { p_code: string }; Returns: string[] }
      respond_transfer: {
        Args: { p_accept: boolean; p_id: string }
        Returns: string
      }
      reverse_journal: {
        Args: { p_entry_id: string; p_reason?: string }
        Returns: string
      }
      reverse_production_run: {
        Args: { p_reason: string; p_run_id: string }
        Returns: string
      }
      revoke_user_permission: {
        Args: { p_code: string; p_user: string }
        Returns: undefined
      }
      roles_for_user: { Args: { p_user: string }; Returns: string[] }
      run_depreciation: {
        Args: { p_date?: string; p_months?: number; p_period_label?: string }
        Returns: string
      }
      run_process_costing: {
        Args: { p_finalize?: boolean; p_month: string; p_stage?: number }
        Returns: string
      }
      search_customers: {
        Args: {
          p_kind?: Database["public"]["Enums"]["customer_kind"]
          p_limit?: number
          p_query?: string
          p_status?: string
        }
        Returns: {
          code: string
          credit_days: number
          credit_limit: number
          gstin: string
          id: string
          image_url: string
          name: string
          outstanding: number
          phone: string
          primary_store_kind: Database["public"]["Enums"]["customer_kind"]
          status: string
          store_count: number
        }[]
      }
      set_challan_status: {
        Args: { p_id: string; p_status: string }
        Returns: string
      }
      set_cheque_status: {
        Args: {
          p_cheque: string
          p_status: Database["public"]["Enums"]["cheque_status"]
        }
        Returns: undefined
      }
      set_cost_account_class: {
        Args: {
          p_class: Database["public"]["Enums"]["costing_class"]
          p_code: string
        }
        Returns: undefined
      }
      set_job_card_status: {
        Args: { p_id: string; p_run_id?: string; p_status: string }
        Returns: undefined
      }
      set_notification_preference: {
        Args: {
          p_category: string
          p_channel: Database["public"]["Enums"]["notification_channel"]
          p_enabled: boolean
        }
        Returns: undefined
      }
      set_role_permission: {
        Args: { p_code: string; p_role_code: string; p_scope?: string }
        Returns: undefined
      }
      stock_qty_for_portal: { Args: { p_item: string }; Returns: number }
      store_outstanding: { Args: { p_store: string }; Returns: number }
      supplier_opening_balance: {
        Args: {
          p_amount: number
          p_as_of?: string
          p_narration?: string
          p_supplier: string
        }
        Returns: string
      }
      supplier_outstanding: { Args: { p_supplier: string }; Returns: number }
      target_achievement: {
        Args: { p_month: string; p_user: string }
        Returns: {
          achieved_amount: number
          pct: number
          target_amount: number
        }[]
      }
      to_e164_storage: { Args: { p_phone: string }; Returns: string }
      topup_petty_cash: {
        Args: { p_amount: number; p_date?: string; p_note?: string }
        Returns: string
      }
      unassign_role: {
        Args: { p_role_code: string; p_user: string }
        Returns: undefined
      }
      unlink_store_from_customer:
        | { Args: { p_store: string }; Returns: string }
        | { Args: { p_new_customer: string; p_store: string }; Returns: string }
      update_order: {
        Args: { p_header: Json; p_order_id: string; p_version: number }
        Returns: string
      }
      update_order_line: {
        Args: {
          p_line_id: string
          p_order_id: string
          p_qty?: number
          p_unit_price?: number
          p_version: number
        }
        Returns: string
      }
      upsert_bom: { Args: { p_header: Json; p_lines: Json }; Returns: string }
      upsert_job_card: { Args: { p_card: Json }; Returns: string }
      vehicle_running_cost: {
        Args: { p_from?: string; p_to?: string; p_vehicle: string }
        Returns: number
      }
      void_invoice: {
        Args: { p_invoice: string; p_reason?: string }
        Returns: string
      }
      void_payment_intent: {
        Args: { p_intent_id: string; p_reason?: string }
        Returns: undefined
      }
      whatsapp_customer_owner: {
        Args: { p_customer_id: string; p_store_id: string }
        Returns: string
      }
      whatsapp_delete_conversation: {
        Args: { p_phone: string }
        Returns: undefined
      }
      whatsapp_enqueue_test_notify: {
        Args: { p_body: string; p_phone: string; p_title: string }
        Returns: string
      }
      whatsapp_enqueue_value_notify: {
        Args: {
          p_customer_id: string
          p_opts: Json
          p_store_id: string
          p_title: string
        }
        Returns: undefined
      }
      whatsapp_get_config: {
        Args: never
        Returns: {
          access_token_encrypted: string | null
          default_template: string | null
          dry_run: boolean
          id: number
          meta_app_id: string | null
          phone_number_id: string | null
          registered_at: string | null
          updated_at: string | null
          updated_by: string | null
          verify_token: string | null
          waba_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      whatsapp_get_or_create_conversation: {
        Args: {
          p_customer_id?: string
          p_customer_store_id?: string
          p_phone: string
        }
        Returns: string
      }
      whatsapp_insert_message: {
        Args: {
          p_body?: string
          p_conversation_id: string
          p_direction: string
          p_media_filename?: string
          p_media_mime?: string
          p_media_url?: string
          p_msg_type?: string
          p_sent_by?: string
          p_status?: string
          p_template_name?: string
          p_template_params?: Json
          p_whatsapp_message_id?: string
        }
        Returns: string
      }
      whatsapp_mark_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      whatsapp_mark_sent: { Args: { p_id: string }; Returns: undefined }
      whatsapp_pending_notifications: {
        Args: { p_limit?: number }
        Returns: {
          action_url: string | null
          body: string | null
          category: string | null
          created_at: string
          created_by: string | null
          delivery_channel: Database["public"]["Enums"]["notification_channel"]
          entity_id: string | null
          entity_type: string | null
          id: string
          read_at: string | null
          sent_at: string | null
          sent_external: boolean
          severity: Database["public"]["Enums"]["notification_severity"]
          status: Database["public"]["Enums"]["notification_status"]
          title: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      whatsapp_pref_allows: {
        Args: { p_category: string; p_user: string }
        Returns: boolean
      }
      whatsapp_recent_notifications: {
        Args: { p_limit?: number }
        Returns: {
          action_url: string | null
          body: string | null
          category: string | null
          created_at: string
          created_by: string | null
          delivery_channel: Database["public"]["Enums"]["notification_channel"]
          entity_id: string | null
          entity_type: string | null
          id: string
          read_at: string | null
          sent_at: string | null
          sent_external: boolean
          severity: Database["public"]["Enums"]["notification_severity"]
          status: Database["public"]["Enums"]["notification_status"]
          title: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      whatsapp_resolve_recipient_phone: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: string
      }
      whatsapp_save_config: {
        Args: {
          p_access_token_encrypted?: string
          p_default_template?: string
          p_dry_run?: boolean
          p_meta_app_id?: string
          p_phone_number_id?: string
          p_verify_token?: string
          p_waba_id?: string
        }
        Returns: undefined
      }
      whatsapp_template_delete: { Args: { p_id: string }; Returns: undefined }
      whatsapp_template_list: {
        Args: { p_status?: string }
        Returns: {
          body_text: string
          category: string
          created_at: string
          id: string
          language: string
          name: string
          status: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "whatsapp_message_templates"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      whatsapp_template_save: {
        Args: {
          p_body_text: string
          p_category?: string
          p_language?: string
          p_name: string
          p_status?: string
        }
        Returns: {
          body_text: string
          category: string
          created_at: string
          id: string
          language: string
          name: string
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_message_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      whatsapp_update_message_status: {
        Args: {
          p_error_message?: string
          p_status: string
          p_whatsapp_message_id: string
        }
        Returns: undefined
      }
      whatsapp_worker_stats: { Args: never; Returns: Json }
      write_audit: {
        Args: {
          p_action: Database["public"]["Enums"]["audit_action"]
          p_actor?: string
          p_diff?: Json
          p_entity: string
          p_entity_id: string
          p_summary?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "income" | "expense"
      asset_class:
        | "plant_machinery"
        | "vehicle"
        | "building"
        | "furniture"
        | "computer"
      asset_status: "active" | "disposed"
      attendance_status:
        | "present"
        | "absent"
        | "half_day"
        | "leave"
        | "holiday"
        | "week_off"
      audit_action:
        | "insert"
        | "update"
        | "delete"
        | "approve"
        | "reject"
        | "post"
        | "void"
        | "login"
      bank_adj_type: "bank_charge" | "interest_income" | "other"
      bank_txn_direction: "credit" | "debit"
      bill_status: "posted" | "paid" | "part_paid" | "void"
      campaign_channel: "whatsapp" | "sms" | "email"
      campaign_status: "draft" | "scheduled" | "sending" | "sent" | "cancelled"
      challan_status: "printed" | "in_transit" | "delivered" | "cancelled"
      cheque_direction: "inbound" | "outbound"
      cheque_status:
        | "registered"
        | "deposited"
        | "cleared"
        | "bounced"
        | "cancelled"
      commission_basis: "revenue" | "cases" | "collection"
      commission_status: "draft" | "computed" | "posted" | "paid"
      complaint_resolution: "replacement" | "credit_note" | "rejected"
      complaint_status: "open" | "in_progress" | "resolved" | "rejected"
      costing_class:
        | "direct_material"
        | "direct_labour"
        | "mfg_overhead"
        | "period_admin"
        | "period_selling"
        | "period_finance"
        | "not_expense"
      credit_note_reason:
        | "scheme_rebate"
        | "complaint"
        | "sales_adjustment"
        | "other"
      credit_note_status: "draft" | "approved" | "posted" | "cancelled"
      customer_kind: "retail" | "wholesale" | "distributor" | "institution"
      debit_note_reason: "return" | "rate_difference" | "shortage" | "other"
      debit_note_status: "posted" | "cancelled"
      dep_method: "slm" | "wdv"
      entry_status: "draft" | "posted" | "void"
      expense_category:
        | "fuel"
        | "repair"
        | "salary"
        | "rent"
        | "power"
        | "transport"
        | "office"
        | "bank_charges"
        | "misc"
      expense_source: "user_holding" | "petty_cash" | "bank"
      expense_status: "pending" | "approved" | "rejected"
      fy_status: "open" | "closed"
      grn_status: "received" | "billed" | "cancelled"
      gst_match_status:
        | "matched"
        | "mismatch"
        | "missing_in_books"
        | "missing_in_2b"
      interaction_type: "call" | "visit" | "whatsapp" | "order" | "note"
      invoice_status: "posted" | "paid" | "part_paid" | "void"
      item_type:
        | "raw_material"
        | "wip"
        | "finished_good"
        | "consumable"
        | "service"
      job_card_status: "planned" | "in_progress" | "completed" | "cancelled"
      lead_status: "new" | "contacted" | "qualified" | "converted" | "lost"
      license_status: "active" | "expired" | "renewal_in_progress"
      license_type:
        | "fssai"
        | "bis_isi"
        | "pcb_consent"
        | "trade_license"
        | "legal_metrology"
        | "other"
      loan_status: "active" | "closed"
      normal_side: "debit" | "credit"
      notification_channel: "in_app" | "whatsapp" | "sms" | "email"
      notification_severity: "info" | "success" | "warning" | "critical"
      notification_status: "unread" | "read" | "archived"
      number_reset: "never" | "yearly"
      order_status:
        | "draft"
        | "confirmed"
        | "approved"
        | "challan_printed"
        | "invoiced"
        | "cancelled"
        | "fulfilled"
        | "partially_fulfilled"
      payment_mode: "cash" | "upi" | "bank" | "cheque" | "card" | "adjustment"
      payroll_status: "draft" | "computed" | "posted" | "paid"
      production_status: "posted" | "reversed"
      purchase_status:
        | "draft"
        | "confirmed"
        | "received"
        | "closed"
        | "cancelled"
      receipt_mode: "cash" | "upi" | "bank" | "cheque" | "card" | "adjustment"
      route_session_status:
        | "pending"
        | "active"
        | "paused"
        | "completed"
        | "cancelled"
      scheme_eligibility_status:
        | "pending_approval"
        | "approved"
        | "rejected"
        | "posted"
      scheme_status: "active" | "closed"
      stock_move_type:
        | "opening"
        | "purchase_in"
        | "sale_out"
        | "production_in"
        | "production_out"
        | "adjust_in"
        | "adjust_out"
        | "transfer_out"
        | "transfer_in"
      supplier_kind: "material" | "packing" | "services" | "asset" | "utility"
      vehicle_ownership: "owned" | "hired"
      visit_type:
        | "fulfill_order"
        | "collect_payment"
        | "record_sale"
        | "mark_visited"
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
      account_type: ["asset", "liability", "equity", "income", "expense"],
      asset_class: [
        "plant_machinery",
        "vehicle",
        "building",
        "furniture",
        "computer",
      ],
      asset_status: ["active", "disposed"],
      attendance_status: [
        "present",
        "absent",
        "half_day",
        "leave",
        "holiday",
        "week_off",
      ],
      audit_action: [
        "insert",
        "update",
        "delete",
        "approve",
        "reject",
        "post",
        "void",
        "login",
      ],
      bank_adj_type: ["bank_charge", "interest_income", "other"],
      bank_txn_direction: ["credit", "debit"],
      bill_status: ["posted", "paid", "part_paid", "void"],
      campaign_channel: ["whatsapp", "sms", "email"],
      campaign_status: ["draft", "scheduled", "sending", "sent", "cancelled"],
      challan_status: ["printed", "in_transit", "delivered", "cancelled"],
      cheque_direction: ["inbound", "outbound"],
      cheque_status: [
        "registered",
        "deposited",
        "cleared",
        "bounced",
        "cancelled",
      ],
      commission_basis: ["revenue", "cases", "collection"],
      commission_status: ["draft", "computed", "posted", "paid"],
      complaint_resolution: ["replacement", "credit_note", "rejected"],
      complaint_status: ["open", "in_progress", "resolved", "rejected"],
      costing_class: [
        "direct_material",
        "direct_labour",
        "mfg_overhead",
        "period_admin",
        "period_selling",
        "period_finance",
        "not_expense",
      ],
      credit_note_reason: [
        "scheme_rebate",
        "complaint",
        "sales_adjustment",
        "other",
      ],
      credit_note_status: ["draft", "approved", "posted", "cancelled"],
      customer_kind: ["retail", "wholesale", "distributor", "institution"],
      debit_note_reason: ["return", "rate_difference", "shortage", "other"],
      debit_note_status: ["posted", "cancelled"],
      dep_method: ["slm", "wdv"],
      entry_status: ["draft", "posted", "void"],
      expense_category: [
        "fuel",
        "repair",
        "salary",
        "rent",
        "power",
        "transport",
        "office",
        "bank_charges",
        "misc",
      ],
      expense_source: ["user_holding", "petty_cash", "bank"],
      expense_status: ["pending", "approved", "rejected"],
      fy_status: ["open", "closed"],
      grn_status: ["received", "billed", "cancelled"],
      gst_match_status: [
        "matched",
        "mismatch",
        "missing_in_books",
        "missing_in_2b",
      ],
      interaction_type: ["call", "visit", "whatsapp", "order", "note"],
      invoice_status: ["posted", "paid", "part_paid", "void"],
      item_type: [
        "raw_material",
        "wip",
        "finished_good",
        "consumable",
        "service",
      ],
      job_card_status: ["planned", "in_progress", "completed", "cancelled"],
      lead_status: ["new", "contacted", "qualified", "converted", "lost"],
      license_status: ["active", "expired", "renewal_in_progress"],
      license_type: [
        "fssai",
        "bis_isi",
        "pcb_consent",
        "trade_license",
        "legal_metrology",
        "other",
      ],
      loan_status: ["active", "closed"],
      normal_side: ["debit", "credit"],
      notification_channel: ["in_app", "whatsapp", "sms", "email"],
      notification_severity: ["info", "success", "warning", "critical"],
      notification_status: ["unread", "read", "archived"],
      number_reset: ["never", "yearly"],
      order_status: [
        "draft",
        "confirmed",
        "approved",
        "challan_printed",
        "invoiced",
        "cancelled",
        "fulfilled",
        "partially_fulfilled",
      ],
      payment_mode: ["cash", "upi", "bank", "cheque", "card", "adjustment"],
      payroll_status: ["draft", "computed", "posted", "paid"],
      production_status: ["posted", "reversed"],
      purchase_status: [
        "draft",
        "confirmed",
        "received",
        "closed",
        "cancelled",
      ],
      receipt_mode: ["cash", "upi", "bank", "cheque", "card", "adjustment"],
      route_session_status: [
        "pending",
        "active",
        "paused",
        "completed",
        "cancelled",
      ],
      scheme_eligibility_status: [
        "pending_approval",
        "approved",
        "rejected",
        "posted",
      ],
      scheme_status: ["active", "closed"],
      stock_move_type: [
        "opening",
        "purchase_in",
        "sale_out",
        "production_in",
        "production_out",
        "adjust_in",
        "adjust_out",
        "transfer_out",
        "transfer_in",
      ],
      supplier_kind: ["material", "packing", "services", "asset", "utility"],
      vehicle_ownership: ["owned", "hired"],
      visit_type: [
        "fulfill_order",
        "collect_payment",
        "record_sale",
        "mark_visited",
      ],
    },
  },
} as const
