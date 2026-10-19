import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public reads of the shared chat list go through the server so the tables
// themselves are not readable directly by every visitor.
export const listChats = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("chats")
    .select("id,title,document_id")
    .order("created_at", { ascending: false })
    .limit(30);
  return data ?? [];
});

export const getChat = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ chatId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: chat } = await supabaseAdmin
      .from("chats").select("document_id").eq("id", data.chatId).maybeSingle();
    if (!chat) return { messages: [], document: null };
    const { data: msgs } = await supabaseAdmin
      .from("chat_messages").select("role,content,pages").eq("chat_id", data.chatId).order("created_at").limit(500);
    let document: { id: string; file_name: string } | null = null;
    if (chat.document_id) {
      const { data: d } = await supabaseAdmin
        .from("documents").select("id,file_name").eq("id", chat.document_id).maybeSingle();
      document = d ?? null;
    }
    return { messages: msgs ?? [], document };
  });
