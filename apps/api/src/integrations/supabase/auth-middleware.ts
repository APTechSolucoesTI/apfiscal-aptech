// Marcador de compatibilidade para as ações legadas. A autenticação real ocorre no AuthGuard do Nest.
export const requireSupabaseAuth = Symbol("requireSupabaseAuth");
