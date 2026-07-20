import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserPlus, Mail, MoreHorizontal, ArrowUpDown, Eye, Info } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/settings/members")({
  component: Members,
});

const mockMembers = [
  { id: "1", name: "João Silva", email: "joao@example.com", role: "Admin" },
  { id: "2", name: "Maria Oliveira", email: "maria@example.com", role: "Financeiro" }
];

function Members() {
  const { items: sortedMembers, requestSort, sortConfig } = useSortableData(mockMembers);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<typeof mockMembers[0] | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);


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
              <Button type="button" variant="outline" onClick={() => setIsInviteDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-blue-600">Enviar Convite</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-100 bg-slate-50/50">
                <TableHead 
                  className="text-slate-500 font-semibold pl-6 cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => requestSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Nome <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-slate-500 font-semibold cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => requestSort('email')}
                >
                  <div className="flex items-center gap-1">
                    E-mail <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-slate-500 font-semibold cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => requestSort('role')}
                >
                  <div className="flex items-center gap-1">
                    Papel <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="text-right text-slate-500 font-semibold pr-6">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMembers.map((member) => (

                <TableRow key={member.id} className="border-slate-100 hover:bg-slate-50 transition-colors">
                  <TableCell className="font-medium text-slate-900 pl-6">{member.name}</TableCell>
                  <TableCell className="text-slate-600">{member.email}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                      {member.role}
                    </span>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <div className="flex justify-end gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-blue-600 hover:bg-blue-50"
                        onClick={() => {
                          setSelectedMember(member);
                          setIsDetailsOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>

                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Detalhes do Membro</DialogTitle>
            <DialogDescription>
              Informações do usuário na organização.
            </DialogDescription>
          </DialogHeader>
          {selectedMember && (
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-slate-500">Nome Completo</Label>
                  <p className="font-medium text-slate-900">{selectedMember.name}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-500">Endereço de E-mail</Label>
                  <p className="font-medium text-slate-900 flex items-center gap-2">
                    <Mail className="h-3 w-3 text-slate-400" />
                    {selectedMember.email}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-500">Papel / Acesso</Label>
                  <div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {selectedMember.role}
                    </span>
                  </div>
                </div>
              </div>
              <Separator />
              <div className="p-3 bg-slate-50 rounded border flex items-start gap-3">
                <Info className="h-4 w-4 text-slate-400 mt-0.5" />
                <p className="text-xs text-slate-600">
                  Alterações de papel ou remoção de membros devem ser feitas por um Administrador.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Fechar</Button>
            <Button className="bg-red-50 text-red-600 hover:bg-red-100 border-red-100 border">Remover Membro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}