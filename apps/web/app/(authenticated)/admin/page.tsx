"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  Database,
  GitBranch,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
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
  getSuperadminDashboard,
  inviteAdminUser,
  syncAdminConnection,
  testAdminConnection,
  updateAdminCompanyConnection,
  updateAdminTotvsStructure,
  updateAdminTotvsHomologation,
  updateAdminUser,
  updateAdminUserAccess,
  type AdminConnection,
  type SuperadminPayload,
} from "@/services/superadminService";
import { PlanManagement } from "./PlanManagement";

const emptyInvite = {
  fullName: "",
  email: "",
  organizationId: "",
  profileId: "",
  companyIds: [] as string[],
};
const date = (value: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "—");

export default function SuperadminPage() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["superadmin"],
    queryFn: getSuperadminDashboard,
    refetchInterval: 20_000,
  });
  const [invite, setInvite] = useState<typeof emptyInvite | null>(null);
  const [edit, setEdit] = useState<{
    id: string;
    fullName: string;
    active: boolean;
    companyIds: string[];
  } | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["superadmin"] });
  const inviteMutation = useMutation({
    mutationFn: inviteAdminUser,
    onSuccess: async () => {
      toast.success("Convite enviado.");
      setInvite(null);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const activeMutation = useMutation({
    mutationFn: ({ id, fullName, active }: { id: string; fullName: string; active: boolean }) =>
      updateAdminUser(id, { fullName, active }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const editMutation = useMutation({
    mutationFn: async (input: NonNullable<typeof edit>) => {
      await updateAdminUser(input.id, { fullName: input.fullName, active: input.active });
      await updateAdminUserAccess(input.id, input.companyIds);
    },
    onSuccess: async () => {
      toast.success("Usuário atualizado.");
      setEdit(null);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const companyMutation = useMutation({
    mutationFn: ({
      id,
      connectionKey,
      coligadaId,
      filialId,
    }: {
      id: string;
      connectionKey: string | null;
      coligadaId: number | null;
      filialId: number | null;
    }) => updateAdminCompanyConnection(id, { connectionKey, coligadaId, filialId }),
    onSuccess: async () => {
      toast.success("Vínculo TOTVS atualizado.");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const structureMutation = useMutation({
    mutationFn: ({
      organizationId,
      mode,
      mainColigadaId,
    }: {
      organizationId: string;
      mode: "COLIGADA" | "FILIAL";
      mainColigadaId: number | null;
    }) =>
      updateAdminTotvsStructure(
        organizationId,
        mode === "FILIAL"
          ? { mode, mainColigadaId: mainColigadaId! }
          : { mode, mainColigadaId: null },
      ),
    onSuccess: async () => {
      toast.success("Estrutura TOTVS atualizada. Revise os vínculos das empresas.");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const homologationMutation = useMutation({
    mutationFn: ({ organizationId, enabled }: { organizationId: string; enabled: boolean }) =>
      updateAdminTotvsHomologation(organizationId, enabled),
    onSuccess: async () => {
      toast.success("Modo de homologação atualizado.");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const testMutation = useMutation({
    mutationFn: testAdminConnection,
    onSuccess: (result) => toast.success(`Conexão validada no database ${result.database}.`),
    onError: (error: Error) => toast.error(error.message),
  });
  const syncMutation = useMutation({
    mutationFn: ({ organizationId, key }: { organizationId: string; key: string }) =>
      syncAdminConnection(organizationId, key),
    onSuccess: () => toast.success("Sincronização adicionada à fila."),
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading)
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando administração…
      </div>
    );
  if (query.isError || !query.data)
    return (
      <Card className="border-red-200">
        <CardContent className="py-12 text-center text-red-700">
          Não foi possível abrir o painel. Confirme se a conta possui acesso de Super Admin.
        </CardContent>
      </Card>
    );
  const data = query.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">Plataforma</p>
          <h1 className="text-2xl font-bold tracking-tight">Administração do APFiscal</h1>
          <p className="mt-1 text-sm text-slate-500">
            Planos, contas, usuários, bancos TOTVS e saúde das sincronizações.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refresh()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button onClick={() => setInvite({ ...emptyInvite })}>
            <UserPlus className="mr-2 h-4 w-4" />
            Novo usuário
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Users}
          label="Usuários"
          value={data.users.length}
          detail={`${data.users.filter((user) => user.active).length} ativos`}
        />
        <Metric
          icon={Building2}
          label="Contas / empresas"
          value={data.companies.length}
          detail={`${data.organizations.length} contas`}
        />
        <Metric
          icon={Database}
          label="Conexões TOTVS"
          value={data.connections.length}
          detail={`${data.connections.filter((item) => item.configured).length} configuradas`}
        />
        <Metric
          icon={Activity}
          label="Workers fiscais"
          value={data.scheduler.workers}
          detail={`${data.scheduler.schedulers.length} agendas`}
        />
      </div>

      <PlanManagement data={data} />

      <TotvsStructureCard
        data={data}
        saving={structureMutation.isPending || homologationMutation.isPending}
        onSave={(organizationId, mode, mainColigadaId) =>
          structureMutation.mutate({ organizationId, mode, mainColigadaId })
        }
        onHomologationChange={(organizationId, enabled) =>
          homologationMutation.mutate({ organizationId, enabled })
        }
      />

      <section>
        <h2 className="mb-3 text-base font-semibold">Conexões disponíveis no ambiente</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {data.connections.map((connection) => (
            <ConnectionCard
              key={connection.key}
              connection={connection}
              companies={data.companies.filter(
                (company) => company.totvs_connection_key === connection.key,
              )}
              onTest={() => testMutation.mutate(connection.key)}
              onSync={(organizationId) =>
                syncMutation.mutate({ organizationId, key: connection.key })
              }
              busy={testMutation.isPending || syncMutation.isPending}
            />
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Empresas e bancos TOTVS</CardTitle>
          <CardDescription>
            Cada conta usa coligadas independentes ou uma coligada principal separada por filial.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Conexão</TableHead>
                <TableHead>Coligada</TableHead>
                <TableHead>Filial</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.companies.map((company) => (
                <CompanyRow
                  key={company.id}
                  company={company}
                  organization={
                    data.organizations.find(
                      (organization) => organization.id === company.organization_id,
                    )!
                  }
                  connections={data.connections}
                  onSave={(connectionKey, coligadaId, filialId) =>
                    companyMutation.mutate({ id: company.id, connectionKey, coligadaId, filialId })
                  }
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuários</CardTitle>
          <CardDescription>
            Planos pertencem à conta. Aqui ficam somente identidade, ativação e acesso às empresas.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((user) => {
                const memberships = data.memberships.filter(
                  (item) => item.user_id === user.id && item.active,
                );
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-medium">{user.full_name || "Sem nome"}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {memberships
                        .map(
                          (item) =>
                            data.organizations.find((org) => org.id === item.organization_id)?.name,
                        )
                        .filter(Boolean)
                        .join(", ") || (user.is_superadmin ? "Plataforma" : "Sem conta ativa")}
                    </TableCell>
                    <TableCell>{date(user.last_login_at)}</TableCell>
                    <TableCell>
                      <Switch
                        disabled={user.is_superadmin || activeMutation.isPending}
                        checked={user.active}
                        onCheckedChange={(active) =>
                          activeMutation.mutate({
                            id: user.id,
                            fullName: user.full_name || user.email,
                            active,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={user.is_superadmin}
                        onClick={() =>
                          setEdit({
                            id: user.id,
                            fullName: user.full_name || user.email,
                            active: user.active,
                            companyIds: data.companyAccess
                              .filter((access) => access.user_id === user.id)
                              .map((access) => access.company_id),
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

      <RunLogs data={data} />
      <InviteDialog
        value={invite}
        setValue={setInvite}
        data={data}
        saving={inviteMutation.isPending}
        onSave={() => invite && inviteMutation.mutate(invite)}
      />
      <EditUserDialog
        value={edit}
        setValue={setEdit}
        companies={data.companies}
        saving={editMutation.isPending}
        onSave={() => edit && editMutation.mutate(edit)}
      />
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-xs text-slate-500">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TotvsStructureCard({
  data,
  saving,
  onSave,
  onHomologationChange,
}: {
  data: SuperadminPayload;
  saving: boolean;
  onSave: (
    organizationId: string,
    mode: "COLIGADA" | "FILIAL",
    mainColigadaId: number | null,
  ) => void;
  onHomologationChange: (organizationId: string, enabled: boolean) => void;
}) {
  const availableColigadas = [
    ...new Set(
      data.connections
        .filter((connection) => !connection.key.endsWith("_HOMOLOG"))
        .flatMap((connection) => connection.coligadas),
    ),
  ].sort((a, b) => a - b);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">Estrutura TOTVS das contas</CardTitle>
            <CardDescription>
              Por Coligada preserva modelo atual. Por Filial compartilha uma coligada principal.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-2">
        {data.organizations.map((organization) => (
          <TotvsStructureRow
            key={organization.id}
            organization={organization}
            availableColigadas={availableColigadas}
            saving={saving}
            onSave={onSave}
            onHomologationChange={onHomologationChange}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function TotvsStructureRow({
  organization,
  availableColigadas,
  saving,
  onSave,
  onHomologationChange,
}: {
  organization: SuperadminPayload["organizations"][number];
  availableColigadas: number[];
  saving: boolean;
  onSave: (
    organizationId: string,
    mode: "COLIGADA" | "FILIAL",
    mainColigadaId: number | null,
  ) => void;
  onHomologationChange: (organizationId: string, enabled: boolean) => void;
}) {
  const [mode, setMode] = useState(organization.totvs_structure_mode);
  const [mainColigadaId, setMainColigadaId] = useState<number | null>(
    organization.totvs_main_coligada_id,
  );
  const changed =
    mode !== organization.totvs_structure_mode ||
    mainColigadaId !== organization.totvs_main_coligada_id;
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-3">
        <p className="font-medium text-slate-900">{organization.name}</p>
        <p className="text-xs text-slate-500">
          {mode === "FILIAL"
            ? "Empresas separadas por CODFILIAL"
            : "Cada empresa possui sua CODCOLIGADA"}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Estrutura TOTVS</Label>
          <Select
            value={mode}
            onValueChange={(value: "COLIGADA" | "FILIAL") => {
              setMode(value);
              setMainColigadaId(value === "FILIAL" ? (availableColigadas[0] ?? null) : null);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="COLIGADA">Por Coligada</SelectItem>
              <SelectItem value="FILIAL">Por Filial</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Coligada principal TOTVS</Label>
          <Select
            value={mainColigadaId ? String(mainColigadaId) : "none"}
            disabled={mode !== "FILIAL"}
            onValueChange={(value) => setMainColigadaId(Number(value))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" disabled>
                Selecione
              </SelectItem>
              {availableColigadas.map((coligada) => (
                <SelectItem key={coligada} value={String(coligada)}>
                  Coligada {coligada}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <div>
          <Label htmlFor={`homologation-${organization.id}`}>Modo homologação</Label>
          <p className="mt-0.5 text-xs text-slate-600">
            Usa automaticamente a conexão com sufixo _HOMOLOG para leitura e escrita.
          </p>
        </div>
        <Switch
          id={`homologation-${organization.id}`}
          checked={organization.totvs_homologation_mode}
          disabled={saving}
          onCheckedChange={(enabled) => onHomologationChange(organization.id, enabled)}
        />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          disabled={!changed || saving || (mode === "FILIAL" && !mainColigadaId)}
          onClick={() => {
            if (
              confirm(
                "Alterar a estrutura TOTVS remove os vínculos atuais das empresas. Depois, configure a coligada ou filial de cada empresa. Continuar?",
              )
            )
              onSave(organization.id, mode, mainColigadaId);
          }}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar estrutura
        </Button>
      </div>
    </div>
  );
}

function ConnectionCard({
  connection,
  companies,
  onTest,
  onSync,
  busy,
}: {
  connection: AdminConnection;
  companies: Array<{ organization_id: string }>;
  onTest: () => void;
  onSync: (organizationId: string) => void;
  busy: boolean;
}) {
  const organizations = [...new Set(companies.map((company) => company.organization_id))];
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{connection.description}</CardTitle>
            <CardDescription className="font-mono">{connection.key}</CardDescription>
          </div>
          <Badge variant={connection.configured ? "default" : "secondary"}>
            {connection.configured ? "Configurada" : "Incompleta"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Database</p>
            <p className="font-medium">{connection.database || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Coligadas</p>
            <p className="font-medium">{connection.coligadas.join(", ") || "—"}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">{companies.length} empresa(s) vinculada(s)</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!connection.configured || busy}
            onClick={onTest}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Testar
          </Button>
          {organizations.map((organizationId) => (
            <Button
              key={organizationId}
              size="sm"
              disabled={!connection.configured || busy}
              onClick={() => onSync(organizationId)}
            >
              <Play className="mr-2 h-4 w-4" />
              Sincronizar
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CompanyRow({
  company,
  organization,
  connections,
  onSave,
}: {
  company: SuperadminPayload["companies"][number];
  organization: SuperadminPayload["organizations"][number];
  connections: AdminConnection[];
  onSave: (key: string | null, coligada: number | null, filial: number | null) => void;
}) {
  const [key, setKey] = useState(company.totvs_connection_key ?? "none");
  const connection = connections.find((item) => item.key === key);
  const filialMode = organization.totvs_structure_mode === "FILIAL";
  return (
    <TableRow>
      <TableCell className="font-medium">{company.nome_fantasia || company.razao_social}</TableCell>
      <TableCell className="font-mono text-xs">{company.cnpj}</TableCell>
      <TableCell>
        <Select
          value={key}
          onValueChange={(value) => {
            setKey(value);
            if (value === "none") onSave(null, null, null);
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem conexão</SelectItem>
            {connections
              .filter((item) => !item.key.endsWith("_HOMOLOG"))
              .map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {item.description}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={
            company.totvs_connection_key === key && company.totvs_coligada_id
              ? String(company.totvs_coligada_id)
              : "none"
          }
          disabled={!connection || filialMode}
          onValueChange={(value) => value !== "none" && onSave(key, Number(value), null)}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Selecione</SelectItem>
            {connection?.coligadas.map((id) => (
              <SelectItem key={id} value={String(id)}>
                Coligada {id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {filialMode ? (
          <div className="flex items-center gap-2">
            <Input
              className="w-28"
              type="number"
              min={1}
              defaultValue={company.totvs_filial_id ?? ""}
              disabled={!connection}
              aria-label={`Filial TOTVS de ${company.nome_fantasia || company.razao_social}`}
              onBlur={(event) => {
                const filial = Number(event.target.value);
                if (Number.isInteger(filial) && filial > 0) onSave(key, null, filial);
              }}
            />
            <Badge variant="outline">Coligada {organization.totvs_main_coligada_id}</Badge>
          </div>
        ) : (
          <span className="text-sm text-slate-400">Não aplicável</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function CompanyChecks({
  companies,
  selected,
  onChange,
}: {
  companies: Array<{ id: string; nome_fantasia: string | null; razao_social: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Empresas permitidas</Label>
      <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
        {companies.length ? (
          companies.map((company) => (
            <label key={company.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(company.id)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked
                      ? [...selected, company.id]
                      : selected.filter((id) => id !== company.id),
                  )
                }
              />
              {company.nome_fantasia || company.razao_social}
            </label>
          ))
        ) : (
          <p className="text-xs text-slate-500">Nenhuma empresa disponível.</p>
        )}
      </div>
    </div>
  );
}

function RunLogs({ data }: { data: SuperadminPayload }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Execuções recentes</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Conexão</TableHead>
              <TableHead>Gatilho</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Mensagem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.runs.slice(0, 20).map((run) => (
              <TableRow key={run.id}>
                <TableCell>{date(run.created_at)}</TableCell>
                <TableCell className="font-mono text-xs">{run.connection_key || "—"}</TableCell>
                <TableCell>{run.trigger}</TableCell>
                <TableCell>
                  <Badge variant="outline">{run.status}</Badge>
                </TableCell>
                <TableCell className="max-w-80 truncate text-red-600">
                  {run.error_message || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function InviteDialog({
  value,
  setValue,
  data,
  saving,
  onSave,
}: {
  value: typeof emptyInvite | null;
  setValue: (value: typeof emptyInvite | null) => void;
  data: SuperadminPayload;
  saving: boolean;
  onSave: () => void;
}) {
  if (!value) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && setValue(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar usuário</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome completo</Label>
            <Input
              value={value.fullName}
              onChange={(event) => setValue({ ...value, fullName: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={value.email}
              onChange={(event) => setValue({ ...value, email: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Conta</Label>
            <Select
              value={value.organizationId}
              onValueChange={(organizationId) =>
                setValue({ ...value, organizationId, profileId: "", companyIds: [] })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {data.organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Perfil</Label>
            <Select
              value={value.profileId}
              onValueChange={(profileId) => setValue({ ...value, profileId })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {data.profiles
                  .filter((profile) => profile.organization_id === value.organizationId)
                  .map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <CompanyChecks
            companies={data.companies.filter(
              (company) => company.organization_id === value.organizationId,
            )}
            selected={value.companyIds}
            onChange={(companyIds) => setValue({ ...value, companyIds })}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setValue(null)}>
            Cancelar
          </Button>
          <Button
            disabled={
              !value.fullName || !value.email || !value.organizationId || !value.profileId || saving
            }
            onClick={onSave}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar convite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  value,
  setValue,
  companies,
  saving,
  onSave,
}: {
  value: { id: string; fullName: string; active: boolean; companyIds: string[] } | null;
  setValue: (
    value: { id: string; fullName: string; active: boolean; companyIds: string[] } | null,
  ) => void;
  companies: SuperadminPayload["companies"];
  saving: boolean;
  onSave: () => void;
}) {
  if (!value) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && setValue(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={value.fullName}
              onChange={(event) => setValue({ ...value, fullName: event.target.value })}
            />
          </div>
          <label className="flex items-center gap-2">
            <Switch
              checked={value.active}
              onCheckedChange={(active) => setValue({ ...value, active })}
            />
            <span className="text-sm">Usuário ativo</span>
          </label>
          <CompanyChecks
            companies={companies}
            selected={value.companyIds}
            onChange={(companyIds) => setValue({ ...value, companyIds })}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setValue(null)}>
            Cancelar
          </Button>
          <Button disabled={!value.fullName || saving} onClick={onSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
