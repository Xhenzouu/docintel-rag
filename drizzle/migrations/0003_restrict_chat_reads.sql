CREATE OR REPLACE FUNCTION public.chat_exists(_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.chats WHERE id = _id) $$;
CREATE OR REPLACE FUNCTION public.document_exists(_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.documents WHERE id = _id) $$;
REVOKE ALL ON FUNCTION public.chat_exists(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_exists(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_exists(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.document_exists(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "public read chats" ON public.chats;
DROP POLICY IF EXISTS "public read messages" ON public.chat_messages;

DROP POLICY IF EXISTS "validated insert chats" ON public.chats;
CREATE POLICY "validated insert chats" ON public.chats FOR INSERT TO anon, authenticated
WITH CHECK (char_length(btrim(title)) BETWEEN 1 AND 200 AND (document_id IS NULL OR public.document_exists(document_id)));

DROP POLICY IF EXISTS "validated insert messages" ON public.chat_messages;
CREATE POLICY "validated insert messages" ON public.chat_messages FOR INSERT TO anon, authenticated
WITH CHECK (role IN ('user','assistant') AND char_length(content) BETWEEN 1 AND 50000 AND cardinality(pages) <= 200 AND public.chat_exists(chat_id));