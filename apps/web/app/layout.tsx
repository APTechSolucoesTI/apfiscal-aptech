import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "../app-globals.css";

export const metadata: Metadata = {
  title: { default: "APFiscal", template: "%s | APFiscal" },
  description: "Gestão fiscal, vinculação de produtos, rateios e integração ERP.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-950 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
