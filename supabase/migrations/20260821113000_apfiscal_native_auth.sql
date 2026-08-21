-- Autenticação nativa do APFiscal. Não altera auth.users nem qualquer schema externo.
begin;
set local search_path = apfiscal, public, extensions;

-- A tabela de usuários do produto passa a ser a única origem de credenciais.
alter table apfiscal.users drop constraint if exists users_id_fkey;
alter table apfiscal.users
  add column if not exists password_hash text,
  add column if not exists email_verified_at timestamptz,
  add column if not exists last_login_at timestamptz;

-- Usuários já pertencentes ao APFiscal foram importados do mecanismo anterior
-- durante o bootstrap. Eles continuam válidos, mas deverão definir senha pelo
-- fluxo "Esqueci minha senha" antes do primeiro acesso nativo.
update apfiscal.users set email_verified_at = coalesce(email_verified_at, now());
create unique index if not exists users_email_unique_ci on apfiscal.users (lower(email));

-- Desvincula todas as referências do domínio de auth.users e as ancora em
-- apfiscal.users. Os UUIDs existentes são preservados, sem tocar outros schemas.
alter table apfiscal.organization_members drop constraint if exists organization_members_user_id_fkey;
alter table apfiscal.company_access drop constraint if exists company_access_user_id_fkey;
alter table apfiscal.manifestations drop constraint if exists manifestations_usuario_id_fkey;
alter table apfiscal.notification_settings drop constraint if exists notification_settings_user_id_fkey;
alter table apfiscal.audit_logs drop constraint if exists audit_logs_user_id_fkey;

alter table apfiscal.organization_members add constraint organization_members_user_id_fkey foreign key (user_id) references apfiscal.users(id) on delete cascade;
alter table apfiscal.company_access add constraint company_access_user_id_fkey foreign key (user_id) references apfiscal.users(id) on delete cascade;
alter table apfiscal.manifestations add constraint manifestations_usuario_id_fkey foreign key (usuario_id) references apfiscal.users(id) on delete restrict;
alter table apfiscal.notification_settings add constraint notification_settings_user_id_fkey foreign key (user_id) references apfiscal.users(id) on delete cascade;
alter table apfiscal.audit_logs add constraint audit_logs_user_id_fkey foreign key (user_id) references apfiscal.users(id) on delete set null;

-- Os triggers abaixo eram pontes de sincronização com auth.users; removê-los
-- impede que qualquer conta de outro produto seja criada/aceita no APFiscal.
drop trigger if exists apfiscal_sync_auth_user on auth.users;
drop function if exists apfiscal.sync_auth_user();

create or replace function apfiscal.assign_admin_profile_to_creator()
returns trigger language plpgsql security definer
set search_path = apfiscal, pg_temp
as $$
begin
  if new.role = 'admin' and new.profile_id is null then
    select id into new.profile_id from apfiscal.access_profiles
    where organization_id = new.organization_id and name = 'Administrador';
  end if;
  return new;
end $$;
revoke all on function apfiscal.assign_admin_profile_to_creator() from public, anon, authenticated;

create table if not exists apfiscal.user_sessions (
  id uuid primary key,
  user_id uuid not null references apfiscal.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index if not exists user_sessions_active_user_idx on apfiscal.user_sessions(user_id, expires_at desc) where revoked_at is null;

create type apfiscal.user_email_token_type as enum ('verify_email', 'set_password', 'reset_password');
create table if not exists apfiscal.user_email_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references apfiscal.users(id) on delete cascade,
  token_hash text not null unique,
  token_type apfiscal.user_email_token_type not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index if not exists user_email_tokens_open_idx on apfiscal.user_email_tokens(user_id, token_type, expires_at desc) where used_at is null;

alter table apfiscal.user_sessions enable row level security;
alter table apfiscal.user_email_tokens enable row level security;
revoke all on apfiscal.user_sessions, apfiscal.user_email_tokens from anon, authenticated, public;
grant all on apfiscal.user_sessions, apfiscal.user_email_tokens to service_role;

notify pgrst, 'reload schema';
commit;
