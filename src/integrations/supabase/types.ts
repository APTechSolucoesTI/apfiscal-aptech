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
      api_keys: {
        Row: {
          created_at: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          organization_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          organization_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          entity: string
          entity_id: string | null
          id: string
          organization_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity: string
          entity_id?: string | null
          id?: string
          organization_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
          organization_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          bairro: string | null
          cep: string | null
          cnae_principal: string | null
          cnaes: Json
          cnpj: string
          complemento: string | null
          created_at: string | null
          email: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          logradouro: string | null
          municipio: string | null
          nome_fantasia: string | null
          numero: string | null
          organization_id: string
          razao_social: string
          regime_tributario: string | null
          responsavel: string | null
          telefone: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cnae_principal?: string | null
          cnaes?: Json
          cnpj: string
          complemento?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          organization_id: string
          razao_social: string
          regime_tributario?: string | null
          responsavel?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cnae_principal?: string | null
          cnaes?: Json
          cnpj?: string
          complemento?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          organization_id?: string
          razao_social?: string
          regime_tributario?: string | null
          responsavel?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_access: {
        Row: {
          company_id: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_certificates: {
        Row: {
          company_id: string
          created_at: string | null
          expires_at: string
          file_path: string
          id: string
          status: string
          type: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          expires_at: string
          file_path: string
          id?: string
          status?: string
          type: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          expires_at?: string
          file_path?: string
          id?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "digital_certificates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_documents: {
        Row: {
          chave_acesso: string
          company_id: string
          created_at: string | null
          data_emissao: string | null
          emitente_cnpj: string | null
          emitente_nome: string | null
          id: string
          numero: string
          pdf_path: string | null
          risk_flag: boolean | null
          serie: string | null
          situacao: string | null
          status_manifestacao: string | null
          tipo: Database["public"]["Enums"]["document_type"]
          valor_impostos: number | null
          valor_total: number | null
          xml_path: string | null
        }
        Insert: {
          chave_acesso: string
          company_id: string
          created_at?: string | null
          data_emissao?: string | null
          emitente_cnpj?: string | null
          emitente_nome?: string | null
          id?: string
          numero: string
          pdf_path?: string | null
          risk_flag?: boolean | null
          serie?: string | null
          situacao?: string | null
          status_manifestacao?: string | null
          tipo: Database["public"]["Enums"]["document_type"]
          valor_impostos?: number | null
          valor_total?: number | null
          xml_path?: string | null
        }
        Update: {
          chave_acesso?: string
          company_id?: string
          created_at?: string | null
          data_emissao?: string | null
          emitente_cnpj?: string | null
          emitente_nome?: string | null
          id?: string
          numero?: string
          pdf_path?: string | null
          risk_flag?: boolean | null
          serie?: string | null
          situacao?: string | null
          status_manifestacao?: string | null
          tipo?: Database["public"]["Enums"]["document_type"]
          valor_impostos?: number | null
          valor_total?: number | null
          xml_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      manifestations: {
        Row: {
          created_at: string | null
          fiscal_document_id: string
          id: string
          tipo: string
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          fiscal_document_id: string
          id?: string
          tipo: string
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          fiscal_document_id?: string
          id?: string
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manifestations_fiscal_document_id_fkey"
            columns: ["fiscal_document_id"]
            isOneToOne: false
            referencedRelation: "fiscal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          company_id: string | null
          email_enabled: boolean | null
          id: string
          organization_id: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          company_id?: string | null
          email_enabled?: boolean | null
          id?: string
          organization_id: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          company_id?: string | null
          email_enabled?: boolean | null
          id?: string
          organization_id?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          company_id: string | null
          created_at: string | null
          id: string
          organization_id: string
          payload: Json | null
          read_at: string | null
          type: string
        }
        Insert: {
          channel: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          organization_id: string
          payload?: Json | null
          read_at?: string | null
          type: string
        }
        Update: {
          channel?: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          organization_id?: string
          payload?: Json | null
          read_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          plan: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          plan?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          plan?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          aliquota_icms: number | null
          aliquota_ipi: number | null
          ativo: boolean
          cest: string | null
          cfop_padrao: string | null
          codigo: string
          codigo_fornecedor: string | null
          company_id: string
          created_at: string
          descricao: string
          ean: string | null
          erp_code: string | null
          erp_external_id: string | null
          erp_metadata: Json
          erp_synced_at: string | null
          erp_system: string | null
          id: string
          ncm: string | null
          organization_id: string
          origem: string
          origem_mercadoria: string | null
          supplier_id: string | null
          unidade: string | null
          updated_at: string
          valor_unitario: number | null
        }
        Insert: {
          aliquota_icms?: number | null
          aliquota_ipi?: number | null
          ativo?: boolean
          cest?: string | null
          cfop_padrao?: string | null
          codigo: string
          codigo_fornecedor?: string | null
          company_id: string
          created_at?: string
          descricao: string
          ean?: string | null
          erp_code?: string | null
          erp_external_id?: string | null
          erp_metadata?: Json
          erp_synced_at?: string | null
          erp_system?: string | null
          id?: string
          ncm?: string | null
          organization_id: string
          origem?: string
          origem_mercadoria?: string | null
          supplier_id?: string | null
          unidade?: string | null
          updated_at?: string
          valor_unitario?: number | null
        }
        Update: {
          aliquota_icms?: number | null
          aliquota_ipi?: number | null
          ativo?: boolean
          cest?: string | null
          cfop_padrao?: string | null
          codigo?: string
          codigo_fornecedor?: string | null
          company_id?: string
          created_at?: string
          descricao?: string
          ean?: string | null
          erp_code?: string | null
          erp_external_id?: string | null
          erp_metadata?: Json
          erp_synced_at?: string | null
          erp_system?: string | null
          id?: string
          ncm?: string | null
          organization_id?: string
          origem?: string
          origem_mercadoria?: string | null
          supplier_id?: string | null
          unidade?: string | null
          updated_at?: string
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          bairro: string | null
          cep: string | null
          cnpj_cpf: string
          company_id: string
          complemento: string | null
          created_at: string
          email: string | null
          erp_code: string | null
          erp_external_id: string | null
          erp_metadata: Json
          erp_synced_at: string | null
          erp_system: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          logradouro: string | null
          municipio: string | null
          nome_fantasia: string | null
          numero: string | null
          organization_id: string
          origem: string
          razao_social: string
          telefone: string | null
          tipo_pessoa: string
          uf: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cnpj_cpf: string
          company_id: string
          complemento?: string | null
          created_at?: string
          email?: string | null
          erp_code?: string | null
          erp_external_id?: string | null
          erp_metadata?: Json
          erp_synced_at?: string | null
          erp_system?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          organization_id: string
          origem?: string
          razao_social: string
          telefone?: string | null
          tipo_pessoa?: string
          uf?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cnpj_cpf?: string
          company_id?: string
          complemento?: string | null
          created_at?: string
          email?: string | null
          erp_code?: string | null
          erp_external_id?: string | null
          erp_metadata?: Json
          erp_synced_at?: string | null
          erp_system?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          organization_id?: string
          origem?: string
          razao_social?: string
          telefone?: string | null
          tipo_pessoa?: string
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_user_organization: { Args: never; Returns: string }
      has_org_role: {
        Args: {
          _org_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      upsert_product_from_nfe: {
        Args: {
          _cfop?: string
          _codigo: string
          _company_id: string
          _descricao: string
          _ean?: string
          _ncm?: string
          _organization_id: string
          _supplier_id?: string
          _unidade?: string
          _valor_unitario?: number
        }
        Returns: string
      }
      upsert_supplier_from_nfe: {
        Args: {
          _cnpj: string
          _company_id: string
          _endereco?: Json
          _ie?: string
          _nome_fantasia?: string
          _organization_id: string
          _razao_social: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "financeiro" | "visualizador"
      document_type: "nfe" | "nfse" | "cte"
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
      app_role: ["admin", "financeiro", "visualizador"],
      document_type: ["nfe", "nfse", "cte"],
    },
  },
} as const
