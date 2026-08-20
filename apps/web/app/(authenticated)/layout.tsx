"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-dvh w-full bg-slate-50">
        <AppSidebar />
        <SidebarInset className="min-w-0 bg-slate-50">
          <header className="sticky top-0 z-20 flex h-14 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:hidden">
            <SidebarTrigger aria-label="Abrir navegação" />
            <span className="ml-3 font-semibold text-slate-900">APFiscal</span>
          </header>
          <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
