const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_JWT_SECRET", "AUTH_SESSION_SECRET"] as const;

export function validateEnvironment(): void {
  const missing: string[] = REQUIRED.filter((key) => !process.env[key]?.trim());
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SECRET_KEY");
  }
  if (missing.length) throw new Error(`Variáveis obrigatórias ausentes: ${missing.join(", ")}`);
  if ((process.env.AUTH_SESSION_SECRET?.trim().length ?? 0) < 32) throw new Error("AUTH_SESSION_SECRET deve ter no mínimo 32 caracteres aleatórios.");
  if ((process.env.SUPABASE_JWT_SECRET?.trim().length ?? 0) < 32) throw new Error("SUPABASE_JWT_SECRET deve corresponder ao JWT_SECRET do Supabase e ter no mínimo 32 caracteres.");
}

export function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

export function supabaseSecret(): string {
  return process.env.SUPABASE_SECRET_KEY?.trim() || env("SUPABASE_SERVICE_ROLE_KEY");
}
