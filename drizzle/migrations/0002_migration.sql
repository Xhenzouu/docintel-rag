DROP POLICY IF EXISTS "public read documents" ON public.documents;
CREATE POLICY "read documents linked to chats" ON public.documents FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.chats c WHERE c.document_id = documents.id));