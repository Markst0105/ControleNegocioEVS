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
      counterparties: {
        Row: {
          id: string;
          name: string;
          role_hint: string | null;
          active: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          role_hint?: string | null;
          active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          role_hint?: string | null;
          active?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          name: string;
          is_bank: boolean | null;
          active: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          is_bank?: boolean | null;
          active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          is_bank?: boolean | null;
          active?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      locations: {
        Row: {
          id: string;
          code: string;
          label: string;
          active: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          label: string;
          active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          code?: string;
          label?: string;
          active?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      inventory_movements: {
        Row: {
          id: string;
          product_id: string;
          moved_on: string | null;
          type: string;
          location_from: string | null;
          location_to: string | null;
          counterparty_id: string | null;
          qty: number;
          event_label: string | null;
          sale_id: string | null;
          purchase_id: string | null;
          notes: string | null;
          created_at: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          product_id: string;
          moved_on?: string | null;
          type: string;
          location_from?: string | null;
          location_to?: string | null;
          counterparty_id?: string | null;
          qty?: number;
          event_label?: string | null;
          sale_id?: string | null;
          purchase_id?: string | null;
          notes?: string | null;
          created_at?: string | null;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          product_id?: string;
          moved_on?: string | null;
          type?: string;
          location_from?: string | null;
          location_to?: string | null;
          counterparty_id?: string | null;
          qty?: number;
          event_label?: string | null;
          sale_id?: string | null;
          purchase_id?: string | null;
          notes?: string | null;
          created_at?: string | null;
          created_by?: string | null;
        };
        Relationships: [];
      };
      purchases: {
        Row: {
          id: string;
          purchased_on: string;
          supplier_id: string | null;
          account_id: string | null;
          location_code: string;
          invoice_no: string | null;
          notes: string | null;
          created_at: string | null;
          updated_at: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          purchased_on: string;
          supplier_id?: string | null;
          account_id?: string | null;
          location_code: string;
          invoice_no?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          purchased_on?: string;
          supplier_id?: string | null;
          account_id?: string | null;
          location_code?: string;
          invoice_no?: string | null;
          notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          created_by?: string | null;
        };
        Relationships: [];
      };
      purchase_items: {
        Row: {
          id: string;
          purchase_id: string;
          product_id: string;
          qty: number;
          unit_cost: number;
          price_tier: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          purchase_id: string;
          product_id: string;
          qty: number;
          unit_cost?: number;
          price_tier?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          purchase_id?: string;
          product_id?: string;
          qty?: number;
          unit_cost?: number;
          price_tier?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      stock_counts: {
        Row: {
          id: string;
          location: string;
          counted_on: string;
          notes: string | null;
          created_at: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          location: string;
          counted_on: string;
          notes?: string | null;
          created_at?: string | null;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          location?: string;
          counted_on?: string;
          notes?: string | null;
          created_at?: string | null;
          created_by?: string | null;
        };
        Relationships: [];
      };
      stock_count_items: {
        Row: {
          id: string;
          stock_count_id: string;
          product_id: string;
          expected_qty: number;
          counted_qty: number;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          stock_count_id: string;
          product_id: string;
          expected_qty?: number;
          counted_qty?: number;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          stock_count_id?: string;
          product_id?: string;
          expected_qty?: number;
          counted_qty?: number;
          created_at?: string | null;
        };
        Relationships: [];
      };
      daily_kpis: {
        Row: {
          id: string;
          kpi_date: string;
          contatos: number | null;
          ligacao: number | null;
          marcacao: number | null;
          apresentacao: number | null;
          indicacoes: number | null;
          convites_traga_um: number | null;
          cliente_novo: number | null;
          cliente_repetidor: number | null;
          acesso_total: number | null;
          cartelas: number | null;
          cortesias: number | null;
          consumo_proprio: number | null;
          panfletos: number | null;
          convidados_hom: number | null;
          convidados_jantar: number | null;
          convidados_qs: number | null;
          convidados_sts: number | null;
          indicacoes_recru: number | null;
          novos_consultores: number | null;
          novos_cons_sr: number | null;
          novos_const_sucesso: number | null;
          novos_supervisores: number | null;
          created_at: string | null;
          updated_at: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          kpi_date: string;
          contatos?: number | null;
          ligacao?: number | null;
          marcacao?: number | null;
          apresentacao?: number | null;
          indicacoes?: number | null;
          convites_traga_um?: number | null;
          cliente_novo?: number | null;
          cliente_repetidor?: number | null;
          acesso_total?: number | null;
          cartelas?: number | null;
          cortesias?: number | null;
          consumo_proprio?: number | null;
          panfletos?: number | null;
          convidados_hom?: number | null;
          convidados_jantar?: number | null;
          convidados_qs?: number | null;
          convidados_sts?: number | null;
          indicacoes_recru?: number | null;
          novos_consultores?: number | null;
          novos_cons_sr?: number | null;
          novos_const_sucesso?: number | null;
          novos_supervisores?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          kpi_date?: string;
          contatos?: number | null;
          ligacao?: number | null;
          marcacao?: number | null;
          apresentacao?: number | null;
          indicacoes?: number | null;
          convites_traga_um?: number | null;
          cliente_novo?: number | null;
          cliente_repetidor?: number | null;
          acesso_total?: number | null;
          cartelas?: number | null;
          cortesias?: number | null;
          consumo_proprio?: number | null;
          panfletos?: number | null;
          convidados_hom?: number | null;
          convidados_jantar?: number | null;
          convidados_qs?: number | null;
          convidados_sts?: number | null;
          indicacoes_recru?: number | null;
          novos_consultores?: number | null;
          novos_cons_sr?: number | null;
          novos_const_sucesso?: number | null;
          novos_supervisores?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
          created_by?: string | null;
        };
        Relationships: [];
      };
      reservations: {
        Row: {
          id: string;
          member_id: string;
          status: string;
          created_at: string | null;
          updated_at: string | null;
          confirmed_at: string | null;
          converted_sale_id: string | null;
        };
        Insert: {
          id?: string;
          member_id: string;
          status: string;
          created_at?: string | null;
          updated_at?: string | null;
          confirmed_at?: string | null;
          converted_sale_id?: string | null;
        };
        Update: {
          id?: string;
          member_id?: string;
          status?: string;
          created_at?: string | null;
          updated_at?: string | null;
          confirmed_at?: string | null;
          converted_sale_id?: string | null;
        };
        Relationships: [];
      };
      reservation_items: {
        Row: {
          id: string;
          reservation_id: string;
          product_id: string;
          qty: number;
          unit_price: number;
          pv: number;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          reservation_id: string;
          product_id: string;
          qty?: number;
          unit_price: number;
          pv?: number;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          reservation_id?: string;
          product_id?: string;
          qty?: number;
          unit_price?: number;
          pv?: number;
          created_at?: string | null;
          updated_at?: string | null;
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
      v_price_catalog: {
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
          retail_price: number | null;
          price_25: number | null;
          price_35: number | null;
          price_42: number | null;
          price_50: number | null;
          price_bronze: number | null;
          price_prata: number | null;
          price_ouro: number | null;
        };
        Relationships: [];
      };
      v_catalog_member: {
        Row: {
          id: string;
          sku: string;
          name: string;
          kind: string;
          portions_per_pack: number | null;
          portion_label: string | null;
          retail_price: number | null;
          pv: number | null;
          is_active: boolean | null;
          print_name: string | null;
          member_tier_code: string;
          member_price: number | null;
        };
        Relationships: [];
      };
      v_reservation_overview: {
        Row: {
          id: string;
          member_id: string;
          member_name: string;
          status: string;
          created_at: string | null;
          confirmed_at: string | null;
          converted_sale_id: string | null;
          item_count: number;
          total_qty: number;
          total: number;
          pv_total: number;
          sale_count: number;
          sales_total: number;
          updated_at: string | null;
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
      v_stock_on_hand: {
        Row: {
          product_id: string;
          sku: string;
          name: string;
          location: string;
          qty_on_hand: number;
        };
        Relationships: [];
      };
      v_stock_product_totals: {
        Row: {
          product_id: string;
          sku: string;
          name: string;
          kind: string;
          is_active: boolean | null;
          qty_on_hand: number;
          unit_cost: number | null;
          price_ouro: number | null;
          stock_value: number;
        };
        Relationships: [];
      };
      v_purchase_overview: {
        Row: {
          id: string;
          purchased_on: string;
          supplier_id: string | null;
          account_id: string | null;
          location_code: string;
          invoice_no: string | null;
          notes: string | null;
          created_at: string | null;
          supplier_name: string | null;
          account_name: string | null;
          item_count: number;
          total_units: number;
          total_cost: number;
        };
        Relationships: [];
      };
      v_supplier_overview: {
        Row: {
          id: string;
          name: string;
          role_hint: string | null;
          active: boolean | null;
          created_at: string | null;
          purchase_count: number;
          total_cost: number;
          last_purchase_on: string | null;
        };
        Relationships: [];
      };
      v_stock_count_overview: {
        Row: {
          id: string;
          location: string;
          counted_on: string;
          notes: string | null;
          created_at: string | null;
          item_count: number;
          total_adjustment: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      client_overview_for_ids: {
        Args: { p_ids: string[] };
        Returns: {
          id: string;
          sales_count: number;
          total_spent: number;
          last_purchase_on: string | null;
          open_amount: number;
        }[];
      };
      merge_clients: {
        Args: { p_source: string; p_target: string };
        Returns: undefined;
      };
      monthly_pnl: {
        Args: { p_month: string };
        Returns: {
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
        }[];
      };
      open_receivables_total: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      stock_for_products: {
        Args: { p_ids: string[] };
        Returns: {
          product_id: string;
          location: string;
          qty_on_hand: number;
        }[];
      };
      inventory_summary: {
        Args: { p_search?: string | null };
        Returns: {
          total_products: number;
          total_units: number;
          low_stock: number;
          out_of_stock: number;
          stock_value: number;
        }[];
      };
      create_purchase: {
        Args: {
          p_purchased_on: string;
          p_supplier_id: string | null;
          p_account_id: string | null;
          p_location_code: string;
          p_invoice_no: string | null;
          p_notes: string | null;
          p_items: Json;
        };
        Returns: string;
      };
      create_reservation: {
        Args: {
          p_member_id: string | null;
          p_items: Json;
        };
        Returns: string;
      };
      convert_reservation: {
        Args: {
          p_reservation_id: string;
          p_sold_on: string;
          p_origin: string;
          p_payment_method_code: string;
          p_deal_type_code: string;
        };
        Returns: string;
      };
      record_inventory_movement: {
        Args: {
          p_type: string;
          p_product_id: string;
          p_moved_on: string;
          p_location_from: string | null;
          p_location_to: string | null;
          p_qty: number;
          p_counterparty_id: string | null;
          p_notes: string | null;
          p_event_label: string | null;
        };
        Returns: string;
      };
      create_stock_count: {
        Args: {
          p_counted_on: string;
          p_location_code: string;
          p_notes: string | null;
          p_items: Json;
        };
        Returns: string;
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
