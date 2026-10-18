create extension if not exists vector;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  created_at timestamptz not null default now()
);
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  content text not null,
  embedding vector(3072) not null,
  page_number int not null
);
create index document_chunks_doc_idx on public.document_chunks(document_id);
create index document_chunks_embedding_idx on public.document_chunks using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  role text not null,
  content text not null,
  pages int[] not null default '{}',
  created_at timestamptz not null default now()
);

grant select on public.documents, public.document_chunks to anon, authenticated;
grant select, insert on public.chats, public.chat_messages to anon, authenticated;
grant all on public.documents, public.document_chunks, public.chats, public.chat_messages to service_role;

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;

create policy "public read documents" on public.documents for select to anon, authenticated using (true);
create policy "public read chats" on public.chats for select to anon, authenticated using (true);
create policy "public insert chats" on public.chats for insert to anon, authenticated with check (true);
create policy "public read messages" on public.chat_messages for select to anon, authenticated using (true);
create policy "public insert messages" on public.chat_messages for insert to anon, authenticated with check (true);

create or replace function public.match_chunks(query_embedding vector(3072), doc_id uuid, match_count int default 4)
returns table (id uuid, content text, page_number int, similarity float)
language sql stable security definer set search_path = public
as $$
  select c.id, c.content, c.page_number,
    1 - (c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) as similarity
  from public.document_chunks c
  where c.document_id = doc_id
  order by c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  limit match_count;
$$;
revoke execute on function public.match_chunks from public, anon, authenticated;
grant execute on function public.match_chunks to service_role;