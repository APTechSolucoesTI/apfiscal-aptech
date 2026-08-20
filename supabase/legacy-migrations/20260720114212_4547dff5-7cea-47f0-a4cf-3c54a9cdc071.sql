-- Additional RLS Policies

-- Organization Members management (Admins only)
CREATE POLICY "Admins podem gerenciar membros" ON public.organization_members FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_members.organization_id AND om.user_id = auth.uid() AND om.role = 'admin'));

-- Companies management (Admins and Financeiro)
CREATE POLICY "Admins e Financeiros podem gerenciar empresas" ON public.companies FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = companies.organization_id AND om.user_id = auth.uid() AND om.role IN ('admin', 'financeiro')));

-- Company Access
CREATE POLICY "Membros podem ver acessos a empresas" ON public.company_access FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.companies c ON c.organization_id = om.organization_id WHERE c.id = company_access.company_id AND om.user_id = auth.uid()));

-- Digital Certificates
CREATE POLICY "Membros podem ver certificados" ON public.digital_certificates FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.companies c ON c.organization_id = om.organization_id WHERE c.id = digital_certificates.company_id AND om.user_id = auth.uid()));
CREATE POLICY "Admins podem gerenciar certificados" ON public.digital_certificates FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.companies c ON c.organization_id = om.organization_id WHERE c.id = digital_certificates.company_id AND om.user_id = auth.uid() AND om.role = 'admin'));

-- Fiscal Documents
CREATE POLICY "Membros podem ver documentos fiscais" ON public.fiscal_documents FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.companies c ON c.organization_id = om.organization_id WHERE c.id = fiscal_documents.company_id AND om.user_id = auth.uid()));

-- Manifestations
CREATE POLICY "Membros podem ver manifestações" ON public.manifestations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.fiscal_documents fd ON fd.id = manifestations.fiscal_document_id JOIN public.companies c ON c.id = fd.company_id WHERE om.organization_id = c.organization_id AND om.user_id = auth.uid()));
CREATE POLICY "Admins e Financeiros podem manifestar" ON public.manifestations FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om JOIN public.fiscal_documents fd ON fd.id = manifestations.fiscal_document_id JOIN public.companies c ON c.id = fd.company_id WHERE om.organization_id = c.organization_id AND om.user_id = auth.uid() AND om.role IN ('admin', 'financeiro')));

-- Notifications
CREATE POLICY "Usuários podem ver suas notificações" ON public.notifications FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = notifications.organization_id AND om.user_id = auth.uid()));

-- Notification Settings
CREATE POLICY "Usuários podem gerenciar suas configurações de notificação" ON public.notification_settings FOR ALL TO authenticated USING (user_id = auth.uid());

-- Audit Logs
CREATE POLICY "Membros podem ver logs de auditoria" ON public.audit_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = audit_logs.organization_id AND om.user_id = auth.uid()));

-- API Keys
CREATE POLICY "Admins podem gerenciar chaves de API" ON public.api_keys FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = api_keys.organization_id AND om.user_id = auth.uid() AND om.role = 'admin'));
