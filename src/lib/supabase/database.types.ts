/**
 * Tipos do banco de dados (subconjunto mantido à mão — cobre as tabelas e
 * views usadas pelo app hoje).
 *
 * Para regenerar o arquivo completo a partir do projeto Supabase:
 *   SUPABASE_PROJECT_ID=<seu-project-ref> npm run db:types
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          role: string;
          price_tier: string | null;
          created_at: string | null;
        };
        Insert: {
          id: string;
          name: string;
          role: string;
          price_tier?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          role?: string;
          price_tier?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          name: string;
          name_normalized: string;
          phone: string | null;
          whatsapp: string | null;
          phone_normalized: string | null;
          whatsapp_normalized: string | null;
          notes: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          name_normalized: string;
          phone?: string | null;
          whatsapp?: string | null;
          phone_normalized?: string | null;
          whatsapp_normalized?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          name_normalized?: string;
          phone?: string | null;
          whatsapp?: string | null;
          phone_normalized?: string | null;
          whatsapp_normalized?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      client_aliases: {
        Row: {
          raw_name: string;
          client_id: string;
          created_at: string | null;
        };
        Insert: {
          raw_name: string;
          client_id: string;
          created_at?: string | null;
        };
        Update: {
          raw_name?: string;
          client_id?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          kind: string;
          item_class: string | null;
          pv: number | null;
          portions_per_pack: number | null;
          portion_label: string | null;
          is_active: boolean | null;
          print_name: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          sku: string;
          name: string;
          kind: string;
          item_class?: string | null;
          pv?: number | null;
          portions_per_pack?: number | null;
          portion_label?: string | null;
          is_active?: boolean | null;
          print_name?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          sku?: string;
          name?: string;
          kind?: string;
          item_class?: string | null;
          pv?: number | null;
          portions_per_pack?: number | null;
          portion_label?: string | null;
          is_active?: boolean | null;
          print_name?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      deal_types: {
        Row: {
          code: string;
          label: string;
          kind: string;
          affects_revenue: boolean | null;
          affects_pv: boolean | null;
          affects_stock: boolean | null;
          active: boolean | null;
          created_at: string | null;
        };
        Insert: {
          code: string;
          label: string;
          kind: string;
          affects_revenue?: boolean | null;
          affects_pv?: boolean | null;
          affects_stock?: boolean | null;
          active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          code?: string;
          label?: string;
          kind?: string;
          affects_revenue?: boolean | null;
          affects_pv?: boolean | null;
          affects_stock?: boolean | null;
          active?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      payment_methods: {
        Row: {
          code: string;
          label: string;
          kind: string;
          fee_pct: number | null;
          settlement_days: number | null;
          active: boolean | null;
          created_at: string | null;
        };
        Insert: {
          code: string;
          label: string;
          kind: string;
          fee_pct?: number | null;
          settlement_days?: number | null;
          active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          code?: string;
          label?: string;
          kind?: string;
          fee_pct?: number | null;
          settlement_days?: number | null;
          active?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          sold_on: string;
          client_id: string | null;
          client_name_raw: string | null;
          payment_method_code: string | null;
          deal_type_code: string | null;
          discount_pct: number | null;
          product_id: string | null;
          product_name_raw: string | null;
          origin: string | null;
          stock_discount_pct: number | null;
          obs: string | null;
          amount_received: number | null;
          product_cost: number | null;
          financial_cost: number | null;
          profit: number | null;
          pv: number | null;
          sale_seq: number | null;
          reservation_id: string | null;
          legacy_row: number | null;
          created_at: string | null;
          updated_at: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          sold_on: string;
          client_id?: string | null;
          client_name_raw?: string | null;
          payment_method_code?: string | null;
          deal_type_code?: string | null;
          discount_pct?: number | null;
          product_id?: string | null;
          product_name_raw?: string | null;
          origin?: string | null;
          stock_discount_pct?: number | null;
          obs?: string | null;
          amount_received?: number | null;
          product_cost?: number | null;
          financial_cost?: number | null;
          pv?: number | null;
          sale_seq?: number | null;
          reservation_id?: string | null;
          legacy_row?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          sold_on?: string;
          client_id?: string | null;
          client_name_raw?: string | null;
          payment_method_code?: string | null;
          deal_type_code?: string | null;
          discount_pct?: number | null;
          product_id?: string | null;
          product_name_raw?: string | null;
          origin?: string | null;
          stock_discount_pct?: number | null;
          obs?: string | null;
          amount_received?: number | null;
          product_cost?: number | null;
          financial_cost?: number | null;
          pv?: number | null;
          sale_seq?: number | null;
          reservation_id?: string | null;
          legacy_row?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
          created_by?: string | null;
        };
        Relationships: [];
      };
      sale_payments: {
        Row: {
          id: string;
          sale_id: string;
          installment: number;
          due_on: string | null;
          amount: number;
          method_code: string | null;
          fee_pct: number | null;
          received_on: string | null;
          received_amount: number | null;
        };
        Insert: {
          id?: string;
          sale_id: string;
          installment: number;
          due_on?: string | null;
          amount?: number;
          method_code?: string | null;
          fee_pct?: number | null;
          received_on?: string | null;
          received_amount?: number | null;
        };
        Update: {
          id?: string;
          sale_id?: string;
          installment?: number;
          due_on?: string | null;
          amount?: number;
          method_code?: string | null;
          fee_pct?: number | null;
          received_on?: string | null;
          received_amount?: number | null;
        };
        Relationships: [];
      };
    };
    Views: {
      v_client_overview: {
        Row: {
          id: string;
          name: string;
          name_normalized: string;
          phone: string | null;
          whatsapp: string | null;
          phone_normalized: string | null;
          whatsapp_normalized: string | null;
          notes: string | null;
          created_at: string | null;
          updated_at: string | null;
          sales_count: number;
          total_spent: number;
          last_purchase_on: string | null;
          open_amount: number;
        };
        Relationships: [];
      };
      v_monthly_pnl: {
        Row: {
          month: string | null;
          ganho_vendas: number | null;
          royalties: number | null;
          bonus: number | null;
          ganho_bruto: number | null;
          custos_fixos: number | null;
          investimentos_promocoes: number | null;
          ganho_liquido: number | null;
          despesas_pessoais: number | null;
          pv_total: number | null;
        };
        Relationships: [];
      };
      v_receivables_schedule: {
        Row: {
          due_on: string | null;
          amount_due: number | null;
          installments: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      merge_clients: {
        Args: { p_source: string; p_target: string };
        Returns: undefined;
      };
      open_receivables_total: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
