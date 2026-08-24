"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Loader2, Pencil, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  saveAdminPlan,
  updateAccountPlan,
  type AccountPlanInput,
  type PlanInput,
  type SubscriptionPlan,
  type SuperadminPayload,
} from "@/services/superadminService";

const featureLabels: Record<string, string> = {
  automatic_nfe: "NF-e automática",
  automatic_nfse: "NFS-e automática",
  automatic_manifestation: "Manifestação automática",
  api_integration: "Integração por API",
  advanced_dashboards: "Dashboards avançados",
  totvs_integration: "Integração TOTVS",
};
const emptyPlan: PlanInput = {
  key: "",
  name: "",
  description: null,
  priceLabel: null,
  active: true,
  highlighted: false,
  maxUsers: null,
  maxCompanies: null,
  maxMonthlyDocuments: null,
  maxTotvsConnections: null,
  features: Object.fromEntries(Object.keys(featureLabels).map((key) => [key, false])),
  sortOrder: 0,
};

export function PlanManagement({ data }: { data: SuperadminPayload }) {
  const client = useQueryClient();
  const [planForm, setPlanForm] = useState<(PlanInput & { existing: boolean }) | null>(null);
  const [accountForm, setAccountForm] = useState<
    (AccountPlanInput & { id: string; name: string }) | null
  >(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["superadmin"] });
  const planMutation = useMutation({
    mutationFn: (input: NonNullable<typeof planForm>) => saveAdminPlan(input, input.existing),
    onSuccess: async () => {
      toast.success("Plano salvo e disponível para as contas.");
      setPlanForm(null);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const accountMutation = useMutation({
    mutationFn: (input: NonNullable<typeof accountForm>) => updateAccountPlan(input.id, input),
    onSuccess: async () => {
      toast.success("Plano e limites da conta atualizados.");
      setAccountForm(null);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const editPlan = (plan: SubscriptionPlan) =>
    setPlanForm({
      existing: true,
      key: plan.key,
      name: plan.name,
      description: plan.description,
      priceLabel: plan.price_label,
      active: plan.active,
      highlighted: plan.highlighted,
      maxUsers: plan.max_users,
      maxCompanies: plan.max_companies,
      maxMonthlyDocuments: plan.max_monthly_documents,
      maxTotvsConnections: plan.max_totvs_connections,
      features: { ...emptyPlan.features, ...plan.features },
      sortOrder: plan.sort_order,
    });
  const limit = (value: number | null) => (value == null ? "Ilimitado" : String(value));

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Planos comerciais</h2>
            <p className="text-sm text-slate-500">
              Cadastre limites e recursos. Alterações valem imediatamente para as contas associadas.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() =>
              setPlanForm({ ...emptyPlan, features: { ...emptyPlan.features }, existing: false })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo plano
          </Button>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {data.plans.map((plan) => (
            <Card key={plan.key} className={plan.highlighted ? "border-blue-300" : undefined}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    <CardDescription>{plan.price_label || "Preço não informado"}</CardDescription>
                  </div>
                  <Badge variant={plan.active ? "default" : "secondary"}>
                    {plan.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Limit label="Usuários" value={limit(plan.max_users)} />
                  <Limit label="Empresas" value={limit(plan.max_companies)} />
                  <Limit label="Docs./mês" value={limit(plan.max_monthly_documents)} />
                  <Limit label="Conexões TOTVS" value={limit(plan.max_totvs_connections)} />
                </div>
                <div className="space-y-1">
                  {Object.entries(featureLabels)
                    .filter(([key]) => plan.features[key])
                    .map(([key, label]) => (
                      <p key={key} className="flex items-center gap-2 text-xs text-slate-600">
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        {label}
                      </p>
                    ))}
                </div>
                <Button size="sm" variant="outline" onClick={() => editPlan(plan)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Configurar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plano por conta</CardTitle>
          <CardDescription>
            O plano define o padrão. Overrides permitem negociar um limite específico sem criar
            outro plano.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Conta</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Uso atual</TableHead>
                <TableHead>Overrides</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.organizations.map((organization) => {
                const users = data.memberships.filter(
                  (item) => item.organization_id === organization.id && item.active,
                ).length;
                const companies = data.companies.filter(
                  (item) => item.organization_id === organization.id,
                ).length;
                const connections = new Set(
                  data.companies
                    .filter((item) => item.organization_id === organization.id)
                    .map((item) => item.totvs_connection_key)
                    .filter(Boolean),
                ).size;
                return (
                  <TableRow key={organization.id}>
                    <TableCell className="font-medium">{organization.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {data.plans.find((plan) => plan.key === organization.plan_key)?.name ||
                          organization.plan_key}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-3 text-xs text-slate-600">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {users}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {companies}
                        </span>
                        <span>{connections} TOTVS</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {[
                        organization.max_users_override &&
                          `${organization.max_users_override} usuários`,
                        organization.max_companies_override &&
                          `${organization.max_companies_override} empresas`,
                        organization.max_monthly_documents_override &&
                          `${organization.max_monthly_documents_override} docs.`,
                        organization.max_totvs_connections_override &&
                          `${organization.max_totvs_connections_override} TOTVS`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Padrão do plano"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setAccountForm({
                            id: organization.id,
                            name: organization.name,
                            planKey: organization.plan_key,
                            maxUsersOverride: organization.max_users_override,
                            maxCompaniesOverride: organization.max_companies_override,
                            maxMonthlyDocumentsOverride:
                              organization.max_monthly_documents_override,
                            maxTotvsConnectionsOverride:
                              organization.max_totvs_connections_override,
                          })
                        }
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PlanDialog
        form={planForm}
        setForm={setPlanForm}
        saving={planMutation.isPending}
        onSave={() => planForm && planMutation.mutate(planForm)}
      />
      <AccountDialog
        form={accountForm}
        setForm={setAccountForm}
        plans={data.plans}
        saving={accountMutation.isPending}
        onSave={() => accountForm && accountMutation.mutate(accountForm)}
      />
    </div>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <p className="text-slate-500">{label}</p>
      <p className="font-semibold text-slate-800">{value}</p>
    </div>
  );
}
function nullableNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

function PlanDialog({
  form,
  setForm,
  saving,
  onSave,
}: {
  form: (PlanInput & { existing: boolean }) | null;
  setForm: (value: (PlanInput & { existing: boolean }) | null) => void;
  saving: boolean;
  onSave: () => void;
}) {
  if (!form) return null;
  const numberField = (
    label: string,
    key: "maxUsers" | "maxCompanies" | "maxMonthlyDocuments" | "maxTotvsConnections",
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        min={1}
        value={form[key] ?? ""}
        placeholder="Ilimitado"
        onChange={(event) => setForm({ ...form, [key]: nullableNumber(event.target.value) })}
      />
    </div>
  );
  return (
    <Dialog open onOpenChange={(open) => !open && setForm(null)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.existing ? "Configurar plano" : "Cadastrar plano"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Chave</Label>
            <Input
              disabled={form.existing}
              value={form.key}
              onChange={(event) =>
                setForm({
                  ...form,
                  key: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                })
              }
              placeholder="starter"
            />
          </div>
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Preço exibido</Label>
            <Input
              value={form.priceLabel ?? ""}
              onChange={(event) => setForm({ ...form, priceLabel: event.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label>Ordem</Label>
            <Input
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Descrição</Label>
            <Input
              value={form.description ?? ""}
              onChange={(event) => setForm({ ...form, description: event.target.value || null })}
            />
          </div>
          {numberField("Máximo de usuários", "maxUsers")}
          {numberField("Máximo de empresas", "maxCompanies")}
          {numberField("Documentos por mês", "maxMonthlyDocuments")}
          {numberField("Conexões TOTVS", "maxTotvsConnections")}
        </div>
        <div>
          <Label>Recursos liberados</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {Object.entries(featureLabels).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <Checkbox
                  checked={Boolean(form.features[key])}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, features: { ...form.features, [key]: checked === true } })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={form.active}
              onCheckedChange={(active) => setForm({ ...form, active })}
            />
            Plano ativo
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={form.highlighted}
              onCheckedChange={(highlighted) => setForm({ ...form, highlighted })}
            />
            Destacar
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setForm(null)}>
            Cancelar
          </Button>
          <Button disabled={saving || !form.key || !form.name} onClick={onSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar plano
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountDialog({
  form,
  setForm,
  plans,
  saving,
  onSave,
}: {
  form: (AccountPlanInput & { id: string; name: string }) | null;
  setForm: (value: (AccountPlanInput & { id: string; name: string }) | null) => void;
  plans: SubscriptionPlan[];
  saving: boolean;
  onSave: () => void;
}) {
  if (!form) return null;
  const numberField = (
    label: string,
    key:
      | "maxUsersOverride"
      | "maxCompaniesOverride"
      | "maxMonthlyDocumentsOverride"
      | "maxTotvsConnectionsOverride",
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        min={1}
        value={form[key] ?? ""}
        placeholder="Usar plano"
        onChange={(event) => setForm({ ...form, [key]: nullableNumber(event.target.value) })}
      />
    </div>
  );
  return (
    <Dialog open onOpenChange={(open) => !open && setForm(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Plano de {form.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Plano</Label>
          <Select value={form.planKey} onValueChange={(planKey) => setForm({ ...form, planKey })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plans
                .filter((plan) => plan.active)
                .map((plan) => (
                  <SelectItem key={plan.key} value={plan.key}>
                    {plan.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-slate-500">
          Deixe um override vazio para usar o limite padrão do plano.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {numberField("Usuários", "maxUsersOverride")}
          {numberField("Empresas", "maxCompaniesOverride")}
          {numberField("Documentos/mês", "maxMonthlyDocumentsOverride")}
          {numberField("Conexões TOTVS", "maxTotvsConnectionsOverride")}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setForm(null)}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={onSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aplicar à conta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
