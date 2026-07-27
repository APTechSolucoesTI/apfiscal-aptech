ALTER TABLE public.centros_custo ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.plano_contas ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE public.centros_custo DROP CONSTRAINT IF EXISTS centros_custo_codigo_empresa_unico;
ALTER TABLE public.plano_contas DROP CONSTRAINT IF EXISTS plano_contas_codigo_empresa_unico;
DROP INDEX IF EXISTS public.centros_custo_codigo_empresa_unico;
DROP INDEX IF EXISTS public.plano_contas_codigo_empresa_unico;

CREATE UNIQUE INDEX centros_custo_codigo_empresa_unico
  ON public.centros_custo (company_id, codigo) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX centros_custo_codigo_global_unico
  ON public.centros_custo (organization_id, codigo) WHERE company_id IS NULL;

CREATE UNIQUE INDEX plano_contas_codigo_empresa_unico
  ON public.plano_contas (company_id, codigo) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX plano_contas_codigo_global_unico
  ON public.plano_contas (organization_id, codigo) WHERE company_id IS NULL;