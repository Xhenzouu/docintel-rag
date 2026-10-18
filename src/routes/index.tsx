import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, FileText, Loader2, MessageSquare, PanelLeft, Plus, SquarePen, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { chunkPages, extractPdfPages } from "@/lib/pdf";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DocIntel — Ask your PDFs" },
      { name: "description", content: "Upload a PDF and ask questions. Answers cite the exact pages they come from." },
      { property: "og:title", content: "DocIntel — Ask your PDFs" },
      { property: "og:description", content: "Upload a PDF and ask questions with page-level citations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: App,
});

type Msg = { role: "user" | "assistant"; content: string; pages?: number[] };
type Chat = { id: string; title: string; document_id: string | null };
type Doc = { id: string; name: string };


function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadChats = useCallback(async () => {
    const { data } = await supabase.from("chats").select("id,title,document_id").order("created_at", { ascending: false }).limit(30);
    setChats(data ?? []);
  }, []);
  useEffect(() => { loadChats(); }, [loadChats]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, processing]);

  const newChat = () => {
    setChatId(null); setDoc(null); setMessages([]); setInput(""); setError(null);
  };

  const openChat = async (c: Chat) => {
    setError(null);
    setChatId(c.id);
    const [{ data: msgs }, { data: d }] = await Promise.all([
      supabase.from("chat_messages").select("role,content,pages").eq("chat_id", c.id).order("created_at"),
      c.document_id ? supabase.from("documents").select("id,file_name").eq("id", c.document_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setMessages((msgs ?? []).map((m) => ({ role: m.role as Msg["role"], content: m.content, pages: m.pages })));
    setDoc(d ? { id: d.id, name: d.file_name } : null);
  };

  const handleFile = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF file."); return;
    }
    setError(null); setChatId(null); setMessages([]); setDoc(null);
    try {
      setProcessing("Reading document...");
      const pages = await extractPdfPages(file);
      const chunks = chunkPages(pages, 500, 50);
      if (!chunks.length) throw new Error("No readable text found in this PDF.");
      setProcessing(`Processing document... (${chunks.length} passages)`);
      const res = await fetch("/api/ingest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, chunks }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload failed");
      setDoc({ id: j.documentId, name: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setProcessing(null);
    }
  };

  const send = async () => {
    const q = input.trim();
    if (!q || streaming || processing) return;
    setInput(""); setError(null);
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setStreaming(true);

    let id = chatId;
    if (!id) {
      const { data } = await supabase.from("chats").insert({ title: q.slice(0, 60), document_id: doc?.id ?? null }).select("id").single();
      id = data?.id ?? null; setChatId(id); loadChats();
    }
    if (id) supabase.from("chat_messages").insert({ chat_id: id, role: "user", content: q }).then();

    let text = ""; let pages: number[] = [];
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc?.id ?? null, question: q, history }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "The assistant couldn't respond.");
      }
      pages = (res.headers.get("X-Citation-Pages") ?? "").split(",").filter(Boolean).map(Number);
      const reader = res.body.getReader(); const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: text, pages }]);
      }
      if (!text.trim()) throw new Error("No response was returned.");
      if (id) await supabase.from("chat_messages").insert({ chat_id: id, role: "assistant", content: text, pages });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      if (!text) setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  };

  const empty = messages.length === 0 && !processing;

  const composer = (
    <div className="w-full">
      {doc && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <FileText className="h-4 w-4 text-brand" strokeWidth={1.5} />
          <span className="max-w-[260px] truncate">{doc.name}</span>
          {messages.length === 0 && (
            <button onClick={() => setDoc(null)} className="text-muted-foreground hover:text-foreground" aria-label="Remove document">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      <div className="rounded-2xl border border-input bg-composer px-3 pb-3 pt-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={doc ? "Ask anything about this document..." : "How can I help you today?"}
          rows={empty ? 3 : 1}
          className="w-full resize-none bg-transparent px-1 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!!processing || streaming}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            aria-label="Upload PDF"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            onClick={send}
            disabled={!input.trim() || streaming || !!processing}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-primary transition-opacity disabled:opacity-30"
            aria-label="Send"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2} />}
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );

  return (
    <div
      className="flex h-screen overflow-hidden bg-background"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
    >
      {sidebar && (
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          <div className="flex items-center justify-between px-4 py-4">
            <span className="flex items-center gap-2.5">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
                <rect x="3" y="3" width="12" height="12" rx="3" fill="currentColor" className="text-brand" />
                <rect x="10.5" y="10.5" width="10.5" height="10.5" rx="3" fill="none" stroke="currentColor" className="text-brand" strokeWidth="2" />
              </svg>
              <span className="font-serif text-lg">DocIntel</span>
            </span>
            <button onClick={() => setSidebar(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close sidebar">
              <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
          <div className="px-2">
            <button onClick={newChat} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent">
              <SquarePen className="h-4 w-4 text-brand" strokeWidth={1.5} /> New chat
            </button>
          </div>
          <div className="mt-6 px-5 pb-2 text-xs text-muted-foreground">Recents</div>
          <nav className="flex-1 overflow-y-auto px-2 pb-4">
            {chats.length === 0 && <p className="px-3 text-xs text-muted-foreground">No chats yet</p>}
            {chats.map((c) => (
              <button key={c.id} onClick={() => openChat(c)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-sidebar-accent ${c.id === chatId ? "bg-sidebar-accent" : ""}`}>
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <span className="truncate">{c.title}</span>
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-pill text-sm">B</div>
            <span className="text-sm">Brix</span>
          </div>
        </aside>
      )}

      <main className="relative flex flex-1 flex-col">
        {!sidebar && (
          <button onClick={() => setSidebar(true)} className="absolute left-4 top-4 text-muted-foreground hover:text-foreground" aria-label="Open sidebar">
            <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <div className="w-full max-w-2xl">
              <h1 className="mb-8 text-center font-serif text-4xl font-normal text-foreground md:text-5xl">
                <span className="mr-3 text-brand">✻</span>What are we researching today?
              </h1>
              {composer}
              {error && <p className="mt-3 text-center text-sm text-destructive">{error}</p>}
              <p className="mt-4 text-center text-xs text-muted-foreground">Drop a PDF anywhere, or use + to upload one.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-bubble px-4 py-2.5 text-[15px] leading-7">{m.content}</div>
                    </div>
                  ) : (
                    <div key={i} className="text-[15px] leading-7 text-foreground">
                      {m.content ? <Rich text={m.content} /> : <Loader2 className="h-4 w-4 animate-spin text-brand" />}
                      {m.content && !!m.pages?.length && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <span className="text-xs text-muted-foreground">Sources:</span>
                          {m.pages.map((p) => <Pill key={p} page={p} />)}
                        </div>
                      )}
                    </div>
                  ),
                )}
                {processing && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-brand" /> {processing}
                  </div>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div ref={endRef} />
              </div>
            </div>
            <div className="mx-auto w-full max-w-2xl px-4 pb-6">{composer}</div>
          </>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-ring bg-background/90">
            <p className="font-serif text-2xl">Drop your PDF here</p>
          </div>
        )}
      </main>
    </div>
  );
}

function Pill({ page }: { page: number }) {
  return (
    <span className="mx-0.5 inline-flex items-center rounded-md bg-pill px-1.5 py-0.5 align-middle text-[11px] font-medium leading-none text-pill-foreground">
      Page {page}
    </span>
  );
}

/** Renders text with **bold** and [Page N] citations as pills. */
function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">{inline(para)}</p>
      ))}
    </div>
  );
}

function inline(s: string): ReactNode[] {
  const parts = s.split(/(\[Pages? [\d,\s\-–]+\]|\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    const cite = p.match(/^\[Pages? ([\d,\s\-–]+)\]$/);
    if (cite) return (cite[1] ?? "").split(/[,\s]+/).filter(Boolean).map((n, j) => <Pill key={`${i}-${j}`} page={n as unknown as number} />);
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
    return p;
  });
}
