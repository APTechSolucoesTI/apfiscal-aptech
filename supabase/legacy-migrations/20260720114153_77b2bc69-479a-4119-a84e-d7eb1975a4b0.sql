-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'financeiro', 'visualizador');
CREATE TYPE public.document_type AS ENUM ('nfe', 'nfse', 'cte');

-- Organizations
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Organization Members
CREATE TABLE public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'visualizador',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Companies
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    cnpj TEXT NOT NULL,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    uf TEXT,
    regime_tributario TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Company Access
CREATE TABLE public.company_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Digital Certificates
CREATE TABLE public.digital_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Fiscal Documents
CREATE TABLE public.fiscal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    tipo document_type NOT NULL,
    chave_acesso TEXT UNIQUE NOT NULL,
    numero TEXT NOT NULL,
    serie TEXT,
    emitente_cnpj TEXT,
    emitente_nome TEXT,
    valor_total DECIMAL(18, 2),
    valor_impostos DECIMAL(18, 2),
    situacao TEXT,
    status_manifestacao TEXT,
    data_emissao TIMESTAMP WITH TIME ZONE,
    xml_path TEXT,
    pdf_path TEXT,
    risk_flag BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Manifestations
CREATE TABLE public.manifestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fiscal_document_id UUID REFERENCES public.fiscal_documents(id) ON DELETE CASCADE NOT NULL,
    tipo TEXT NOT NULL,
    usuario_id UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Notifications
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    channel TEXT NOT NULL,
    payload JSONB,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Notification Settings
CREATE TABLE public.notification_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    email_enabled BOOLEAN DEFAULT TRUE,
    webhook_url TEXT
);

-- Audit Logs
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- API Keys
CREATE TABLE public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    key_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_access TO authenticated;
GRANT ALL ON public.company_access TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_certificates TO authenticated;
GRANT ALL ON public.digital_certificates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_documents TO authenticated;
GRANT ALL ON public.fiscal_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manifestations TO authenticated;
GRANT ALL ON public.manifestations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

-- RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manifestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Basic Policies (example: organization member access)
CREATE POLICY "Membros da organização podem ver a organização" ON public.organizations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = organizations.id AND user_id = auth.uid()));
CREATE POLICY "Membros da organização podem ver a si mesmos" ON public.organization_members FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Membros da organização podem ver empresas" ON public.companies FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = companies.organization_id AND user_id = auth.uid()));
