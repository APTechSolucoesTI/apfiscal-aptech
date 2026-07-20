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
import { UserPlus, Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/members")({
  component: Members,
});

const mockMembers = [
  { id: "1", name: "João Silva", email: "joao@example.com", role: "Admin" },
  { id: "2", name: "Maria Oliveira", email: "maria@example.com", role: "Financeiro" }
];

function Members() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Membros da Equipe</h1>
          <p className="text-slate-500">Gerencie quem tem acesso à sua organização.</p>
        </div>
        <Button className="bg-blue-600">
          <UserPlus className="mr-2 h-4 w-4" /> Convidar Membro
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>{member.role}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">Editar</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
