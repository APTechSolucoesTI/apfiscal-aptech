CREATE TABLE public.tipos_compra (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  descricao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tipos_compra TO authenticated;
GRANT ALL ON public.tipos_compra TO service_role;

ALTER TABLE public.tipos_compra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tipos de compra visiveis para autenticados"
  ON public.tipos_compra FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_tipos_compra_updated_at
  BEFORE UPDATE ON public.tipos_compra
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.tipos_compra (codigo, descricao) VALUES
  ('00', 'Mercadoria para Revenda'),
  ('01', 'Matéria-Prima'),
  ('02', 'Embalagem'),
  ('03', 'Produto em Processo'),
  ('04', 'Produto Acabado'),
  ('05', 'Subproduto'),
  ('06', 'Produto Intermediário'),
  ('07', 'Material de Uso e Consumo'),
  ('08', 'Ativo Imobilizado'),
  ('09', 'Serviços'),
  ('10', 'Outros Insumos'),
  ('99', 'Outras (para itens que não se encaixam nos anteriores)');

ALTER TABLE public.fiscal_documents
  ADD COLUMN tipo_compra_id uuid REFERENCES public.tipos_compra(id);

ALTER TABLE public.fiscal_document_items
  ADD COLUMN tipo_compra_id uuid REFERENCES public.tipos_compra(id),
  ADD COLUMN tipo_compra_alterado_manualmente boolean NOT NULL DEFAULT false,
  ADD COLUMN apontado_por uuid,
  ADD COLUMN apontado_em timestamp with time zone;

CREATE INDEX idx_fiscal_document_items_tipo_compra ON public.fiscal_document_items(tipo_compra_id);