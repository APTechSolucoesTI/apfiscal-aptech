ALTER TABLE public.empresa_integracoes_fiscais
  ADD COLUMN IF NOT EXISTS apfiscal_empresa_id integer,
  ADD COLUMN IF NOT EXISTS apfiscal_system_unit_id integer,
  ADD COLUMN IF NOT EXISTS certificado_validade_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS certificado_validade_fim timestamptz,
  ADD COLUMN IF NOT EXISTS certificado_dias_restantes integer,
  ADD COLUMN IF NOT EXISTS certificado_vencido boolean,
  ADD COLUMN IF NOT EXISTS certificado_arquivo_path text,
  ADD COLUMN IF NOT EXISTS certificado_atualizado_em timestamptz;