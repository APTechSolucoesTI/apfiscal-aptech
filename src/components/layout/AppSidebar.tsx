import { 
  LayoutDashboard, 
  Building2, 
  FileText, 
  ShieldAlert, 
  Bell, 
  Settings, 
  LogOut,
  ChevronRight,
  ShieldCheck,
  Key,
  Activity,
  Users,
  Package,
  Layers,
  Wallet,
} from "lucide-react";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter, 
  SidebarHeader, 
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const menuItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    url: "/dashboard",
  },
  {
    title: "Empresas (CNPJs)",
    icon: Building2,
    url: "/companies",
  },
  {
    title: "Fornecedores",
    icon: Users,
    url: "/suppliers",
  },
  {
    title: "Produtos",
    icon: Package,
    url: "/products",
  },
  {
    title: "Classificações",
    icon: Layers,
    url: "/classifications",
  },
  {
    title: "Documentos Fiscais",
    icon: FileText,
    url: "/documents",
    subItems: [
      { title: "NF-e (Produtos)", url: "/documents/nfe" },
      { title: "NFS-e (Serviços)", url: "/documents/nfse" },
      { title: "CT-e (Transporte)", url: "/documents/cte" },
      { title: "Integração NF-e", url: "/nfe-integracao" },
    ]
  },
  {
    title: "Monitoramento",
    icon: Activity,
    url: "/monitoring",
  },
  {
    title: "Notificações",
    icon: Bell,
    url: "/notifications",
  },
  {
    title: "Cadastros Financeiros",
    icon: Wallet,
    url: "/settings/centros-custo",
    subItems: [
      { title: "Centros de Custo", url: "/settings/centros-custo" },
      { title: "Plano de Contas", url: "/settings/plano-contas" },
      { title: "Local de Estoque", url: "/settings/locais-estoque" },
    ]

  },
  {
    title: "Configurações",
    icon: Settings,
    url: "/settings",
    subItems: [
      { title: "Cadastros Globais", url: "/settings/catalog" },
      { title: "Membros da Equipe", url: "/settings/members" },
      
      { title: "API Keys", url: "/settings/api" },
    ]
  },
];

export function AppSidebar() {
  const router = useRouter();
  const currentPath = useRouterState({
    select: (s) => s.location.pathname,
  });

  const isActive = (url: string) =>
    currentPath === url || currentPath.startsWith(url + "/");

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  };

  return (
    <Sidebar className="border-r border-slate-200">
      <SidebarHeader className="h-16 flex items-center px-6 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">
            AP
          </div>
          <span className="font-bold text-xl text-slate-900 tracking-tight">Fiscal</span>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="p-4 gap-2 bg-white">
        <SidebarGroup>
          <SidebarMenu>
            {menuItems.map((item) => {
              const parentActive = isActive(item.url);
              return (
                <SidebarMenuItem key={item.title}>
                  {item.subItems ? (
                    <>
                      <SidebarMenuButton
                        isActive={parentActive}
                        className="text-slate-600 font-medium hover:bg-slate-50 data-[active=true]:bg-blue-50 data-[active=true]:text-blue-700 data-[active=true]:font-semibold"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        <ChevronRight className="ml-auto h-4 w-4" />
                      </SidebarMenuButton>
                      <SidebarMenuSub>
                        {item.subItems.map((sub) => {
                          const subActive = isActive(sub.url);
                          return (
                            <SidebarMenuSubItem key={sub.title}>
                              <SidebarMenuSubButton asChild isActive={subActive}>
                                <Link
                                  to={sub.url}
                                  className="py-2 text-slate-500 hover:text-blue-600 data-[active=true]:bg-blue-50 data-[active=true]:text-blue-700 data-[active=true]:font-semibold"
                                >
                                  {sub.title}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </>
                  ) : (
                    <SidebarMenuButton
                      asChild
                      isActive={parentActive}
                      className="text-slate-600 font-medium hover:bg-slate-50 data-[active=true]:bg-blue-50 data-[active=true]:text-blue-700 data-[active=true]:font-semibold data-[active=true]:border-l-2 data-[active=true]:border-blue-600"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>


      <SidebarFooter className="p-4 border-t border-slate-100 bg-white">
        <div className="p-3 mb-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            <span className="text-xs font-semibold text-slate-700">Status Compliance</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1.5">
            <div className="bg-green-500 h-1.5 rounded-full w-[85%]"></div>
          </div>
          <p className="text-[10px] mt-2 text-slate-500 italic">85% das notas manifestadas no prazo legal</p>
        </div>

        <button 
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
        >
          <LogOut className="h-4 w-4" />
          <span>Sair da conta</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
