import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserPlus, ArrowUpDown, Eye, Loader2, Info } from "lucide-react";
import { useSortableData } from "@/hooks/use-sortable-data";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/members")({
  component: Members,
});

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  is_me: boolean;
  display: string;
};

function Members() {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["organization_members"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const currentId = userRes.user?.id;
      const { data, error } = await supabase
        .from("organization_members")
        .select("id, user_id, role, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((m) => ({
        ...m,
        is_me: m.user_id === currentId,
        display: m.user_id === currentId ? (userRes.user?.email ?? "Você") : `Usuário ${m.user_id.slice(0, 8)}`,
      })) as MemberRow[];
    },
  });

  const { items: sortedMembers, requestSort } = useSortableData(members);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Membros da Equipe</h1>
          <p className="text-slate-500">Gerencie quem tem acesso à sua organização.</p>
        </div>
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <UserPlus className="mr-2 h-4 w-4" /> Convidar Membro
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Convidar Membro</DialogTitle>
              <DialogDescription>
                Envie um convite por e-mail para adicionar um novo membro à equipe.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" placeholder="email@exemplo.com" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Papel / Função</Label>
                <Select defaultValue="visualizador">
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Selecione o papel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                    <SelectItem value="visualizador">Visualizador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>Cancelar</Button>
              <Button
                className="bg-blue-600"
                onClick={() => {
                  toast.info("Envio de convites por e-mail será habilitado em breve.");
                  setIsInviteDialogOpen(false);
                }}
              >
                Enviar Convite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : sortedMembers.length === 0 ? (
            <div className="text-center py-16 text-slate-500">Nenhum membro na organização.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-slate-100 bg-slate-50/50">
                  <TableHead className="pl-6 cursor-pointer" onClick={() => requestSort("display")}>
                    <div className="flex items-center gap-1">Membro <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => requestSort("role")}>
                    <div className="flex items-center gap-1">Papel <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => requestSort("created_at")}>
                    <div className="flex items-center gap-1">Desde <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="text-right pr-6">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMembers.map((member) => (
                  <TableRow key={member.id} className="border-slate-100 hover:bg-slate-50">
                    <TableCell className="font-medium text-slate-900 pl-6">
                      {member.display}
                      {member.is_me && <span className="ml-2 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">você</span>}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                        {member.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-600 text-sm">
                      {new Date(member.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-blue-600"
                        onClick={() => { setSelectedMember(member); setIsDetailsOpen(true); }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Detalhes do Membro</DialogTitle>
            <DialogDescription>Informações do usuário na organização.</DialogDescription>
          </DialogHeader>
          {selectedMember && (
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                <div><Label className="text-slate-500">Identificação</Label><p className="font-medium">{selectedMember.display}</p></div>
                <div><Label className="text-slate-500">ID do Usuário</Label><p className="font-mono text-xs break-all">{selectedMember.user_id}</p></div>
                <div><Label className="text-slate-500">Papel</Label>
                  <div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                      {selectedMember.role}
                    </span>
                  </div>
                </div>
                <div><Label className="text-slate-500">Membro desde</Label><p className="font-medium">{new Date(selectedMember.created_at).toLocaleDateString("pt-BR")}</p></div>
              </div>
              <Separator />
              <div className="p-3 bg-slate-50 rounded border flex items-start gap-3">
                <Info className="h-4 w-4 text-slate-400 mt-0.5" />
                <p className="text-xs text-slate-600">Apenas administradores podem alterar papéis ou remover membros.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
