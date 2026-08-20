ALTER TABLE public.fiscal_documents
  ADD COLUMN IF NOT EXISTS local_estoque_id uuid REFERENCES public.locais_estoque(id) ON DELETE SET NULL;

ALTER TABLE public.fiscal_document_items
  ADD COLUMN IF NOT EXISTS local_estoque_id uuid REFERENCES public.locais_estoque(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS local_estoque_alterado_manualmente boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_fiscal_document_items_local_estoque ON public.fiscal_document_items(local_estoque_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_local_estoque ON public.fiscal_documents(local_estoque_id);