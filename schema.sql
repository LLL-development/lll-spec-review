-- ============================================================
-- 朱入れ (Shuire) — HTML Spec Review Tool
-- Phase 1 schema: profiles, projects, members, documents
-- (comments table included, RLS-ready for Phase 2)
-- Run this in the Supabase SQL Editor on a fresh project.
-- ============================================================

-- ---------- Tables ----------

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text not null default '',
  role         text not null default 'client' check (role in ('internal','client')),
  created_at   timestamptz not null default now()
);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  client_name text not null default '',
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now()
);

create table public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'client_commenter'
              check (member_role in ('owner','client_commenter','client_viewer')),
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  filename     text not null,
  storage_path text not null,
  version      int  not null,
  uploaded_by  uuid not null references public.profiles(id),
  uploaded_at  timestamptz not null default now(),
  unique (project_id, filename, version)
);

-- Phase 2 table, created now so RLS is in place from day one
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  anchor      jsonb,                -- {selector, text_snippet, x, y}
  body        text not null,
  author_id   uuid not null references public.profiles(id),
  parent_id   uuid references public.comments(id) on delete cascade,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index idx_documents_project on public.documents(project_id);
create index idx_comments_document on public.comments(document_id);
create index idx_members_user      on public.project_members(user_id);

-- ---------- Helper functions (security definer avoids RLS recursion) ----------

create or replace function public.is_internal()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'internal'
  );
$$;

create or replace function public.is_project_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members where project_id = p and user_id = auth.uid()
  );
$$;

create or replace function public.can_comment_on_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_internal() or exists (
    select 1 from project_members
    where project_id = p and user_id = auth.uid()
      and member_role in ('owner','client_commenter')
  );
$$;

-- ---------- Auto-create profile on signup ----------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------

alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.documents       enable row level security;
alter table public.comments        enable row level security;

-- profiles: read own; internal reads all (needed to add members by email)
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_internal());

create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- projects: internal full access; clients see projects they belong to
create policy "projects_select" on public.projects for select to authenticated
  using (public.is_internal() or public.is_project_member(id));

create policy "projects_insert" on public.projects for insert to authenticated
  with check (public.is_internal() and created_by = auth.uid());

create policy "projects_update" on public.projects for update to authenticated
  using (public.is_internal());

create policy "projects_delete" on public.projects for delete to authenticated
  using (public.is_internal());

-- project_members: internal manages; users can see their own memberships
create policy "members_select" on public.project_members for select to authenticated
  using (public.is_internal() or user_id = auth.uid());

create policy "members_insert" on public.project_members for insert to authenticated
  with check (public.is_internal());

create policy "members_update" on public.project_members for update to authenticated
  using (public.is_internal());

create policy "members_delete" on public.project_members for delete to authenticated
  using (public.is_internal());

-- documents: internal full; members can read
create policy "documents_select" on public.documents for select to authenticated
  using (public.is_internal() or public.is_project_member(project_id));

create policy "documents_insert" on public.documents for insert to authenticated
  with check (public.is_internal() and uploaded_by = auth.uid());

create policy "documents_delete" on public.documents for delete to authenticated
  using (public.is_internal());

-- comments (Phase 2 ready): project members + internal
create policy "comments_select" on public.comments for select to authenticated
  using (exists (
    select 1 from public.documents d
    where d.id = document_id
      and (public.is_internal() or public.is_project_member(d.project_id))
  ));

create policy "comments_insert" on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.documents d
      where d.id = document_id and public.can_comment_on_project(d.project_id)
    )
  );

create policy "comments_update" on public.comments for update to authenticated
  using (author_id = auth.uid() or public.is_internal());

create policy "comments_delete" on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_internal());

-- ---------- Storage ----------
-- Private bucket; files stored as {project_id}/{document_id}.html

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false);

create policy "storage_internal_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_internal());

create policy "storage_member_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.is_internal()
      or public.is_project_member((split_part(name, '/', 1))::uuid)
    )
  );

create policy "storage_internal_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_internal());

-- ============================================================
-- After running this file, promote your internal team members:
--
--   update public.profiles set role = 'internal'
--   where email in ('you@lll.example', 'teammate@lll.example');
--
-- (Users must sign up once before they appear in profiles.)
-- ============================================================
