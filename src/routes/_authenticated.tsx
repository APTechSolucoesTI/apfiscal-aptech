import { createFileRoute, Outlet, redirect, useRouter, Link } from "@tanstack/react-router";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
  },
  component: AuthenticatedLayout,
  errorComponent: AuthenticatedErrorBoundary,
});

function AuthenticatedLayout() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-slate-50">
        <AppSidebar />
        <SidebarInset className="flex flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function AuthenticatedErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  const message = error?.message || String(error);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-slate-50">
        <AppSidebar />
        <SidebarInset className="flex flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-2xl rounded-lg border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Não foi possível carregar esta página
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Você pode tentar novamente ou navegar para outra seção pela barra lateral.
              </p>
              {message && (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-semibold text-red-700">Detalhes</p>
                  <p className="mt-1 text-xs font-mono text-red-800 break-words whitespace-pre-wrap">
                    {message}
                  </p>
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    router.invalidate();
                    reset();
                  }}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Tentar novamente
                </button>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center justify-center rounded-md border border-input bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
                >
                  Ir para o Dashboard
                </Link>
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
