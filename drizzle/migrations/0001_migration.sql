DROP POLICY IF EXISTS "public insert chats" ON public.chats;
CREATE POLICY "validated insert chats" ON public.chats FOR INSERT TO anon, authenticated
WITH CHECK (
  char_length(btrim(title)) BETWEEN 1 AND 200
  AND (document_id IS NULL OR EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id))
);

DROP POLICY IF EXISTS "public insert messages" ON public.chat_messages;
CREATE POLICY "validated insert messages" ON public.chat_messages FOR INSERT TO anon, authenticated
WITH CHECK (
  role IN ('user','assistant')
  AND char_length(content) BETWEEN 1 AND 50000
  AND cardinality(pages) <= 200
  AND EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id)
);