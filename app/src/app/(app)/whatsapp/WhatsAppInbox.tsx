"use client";

import { useState, useTransition, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input, Badge, EmptyState } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { dateTimeIST } from "@/lib/format";
import type { ConversationSummary } from "@/lib/data/whatsapp";
import type { Database } from "@/lib/supabase/database.types";
import {
  getConversationMessages,
  markConversationRead,
  sendWhatsAppMessage,
} from "@/lib/actions/whatsapp";

type MessageRow = Database["public"]["Tables"]["whatsapp_messages"]["Row"];

export function WhatsAppInbox({
  conversations,
  dryRun,
}: {
  conversations: ConversationSummary[];
  dryRun: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingThread, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const threadEndRef = useRef<HTMLDivElement>(null);
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const filtered = conversations.filter((c) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      (c.customer_name ?? "").toLowerCase().includes(q) ||
      (c.store_name ?? "").toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q)
    );
  });

  const openThread = useCallback(
    (conv: ConversationSummary) => {
      setSelectedId(conv.id);
      setMessages([]);
      startLoad(async () => {
        const res = await getConversationMessages(conv.id);
        if (!res.ok) {
          toast.error("Could not load thread", res.error);
        } else if (res.messages) {
          setMessages(res.messages);
        }
        await markConversationRead(conv.id);
        router.refresh();
      });
    },
    [router, toast],
  );

  useEffect(() => {
    if (selectedId && !loadingThread && messages.length > 0) {
      threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, selectedId, loadingThread]);

  function handleSend() {
    const text = draft.trim();
    if (!text || !selectedId) return;
    setDraft("");
    startSend(async () => {
      const res = await sendWhatsAppMessage({ conversationId: selectedId, type: "text", text });
      if (res.ok) {
        toast.success("Message sent", dryRun ? "(dry-run — no Meta call)" : undefined);
        const reload = await getConversationMessages(selectedId);
        if (!reload.ok) {
          toast.error("Could not reload thread", reload.error);
        } else if (reload.messages) {
          setMessages(reload.messages);
        }
        await markConversationRead(selectedId);
        router.refresh();
      } else {
        toast.error("Could not send", res.error);
        setDraft(text);
      }
    });
  }

  return (
    <div className="grid h-[calc(100vh-220px)] min-h-[480px] grid-cols-1 overflow-hidden rounded-xl border border-line bg-white md:grid-cols-[340px_1fr]">
      {/* ---- conversation list ---- */}
      <div className="flex min-h-0 flex-col border-b border-line md:border-b-0 md:border-r">
        <div className="border-b border-line p-3">
          <Input
            placeholder="Search name or phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            mono
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <EmptyState
              title="No conversations"
              description={
                query.trim()
                  ? "Nothing matches your search."
                  : "Inbound messages and sends appear here."
              }
            />
          ) : (
            filtered.map((c) => {
              const active = c.id === selectedId;
              const name = c.customer_name ?? c.store_name ?? `+${c.phone}`;
              const sub = c.store_name && c.store_name !== c.customer_name ? c.store_name : null;
              return (
                <button
                  key={c.id}
                  onClick={() => openThread(c)}
                  className={`flex w-full items-start gap-3 border-b border-line px-3 py-3 text-left transition-colors hover:bg-fill ${
                    active ? "bg-brand-wash" : ""
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white ${
                      active ? "bg-brand" : "bg-ink-3"
                    }`}
                  >
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold text-ink">{name}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-ink-4">
                        {c.last_message_at ? dateTimeIST(c.last_message_at).split(",")[1]?.trim() ?? "" : ""}
                      </span>
                    </div>
                    {sub && <p className="truncate text-[11px] text-ink-3">{sub}</p>}
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p
                        className={`truncate text-[12px] ${
                          c.last_message_direction === "inbound" ? "text-ink-2" : "text-ink-3"
                        }`}
                      >
                        {c.last_message_direction === "inbound" ? "" : "→ "}
                        {c.last_message_body ?? "(no messages yet)"}
                      </p>
                      {c.unread_count > 0 && (
                        <Badge tone="brand" size="sm">{c.unread_count}</Badge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ---- thread ---- */}
      <div className="flex min-h-0 flex-col">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              title="Select a conversation"
              description="Choose a thread on the left to read and reply."
            />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white">
                {(selected.customer_name ?? selected.store_name ?? "+" + selected.phone)
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">
                  {selected.customer_name ?? selected.store_name ?? `+${selected.phone}`}
                </p>
                <p className="truncate text-[11px] text-ink-3">
                  {selected.store_name && selected.store_name !== selected.customer_name
                    ? `${selected.store_name} · `
                    : ""}
                  +{selected.phone}
                  {dryRun && <span className="ml-2 text-amb">dry-run</span>}
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {loadingThread && messages.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-ink-4">Loading thread…</p>
              ) : messages.length === 0 ? (
                <EmptyState
                  title="No messages yet"
                  description="This thread is empty. Send the first message below."
                />
              ) : (
                messages.map((m) => {
                  const inbound = m.direction === "inbound";
                  return (
                    <div key={m.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                      <div
                        className={`max-w-[70%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                          inbound
                            ? "rounded-tl-sm bg-fill text-ink"
                            : "rounded-tr-sm bg-brand text-white"
                        }`}
                      >
                        {m.msg_type === "template" && (
                          <p className={`mb-1 text-[10px] font-semibold ${inbound ? "text-ink-4" : "text-white/70"}`}>
                            Template · {m.template_name}
                          </p>
                        )}
                        {m.body ?? (
                          <span className="italic opacity-70">
                            {m.msg_type === "image" ? "📷 Image" : m.msg_type}
                          </span>
                        )}
                        <p
                          className={`mt-1 text-[10px] tabular-nums ${
                            inbound ? "text-ink-4" : "text-white/60"
                          }`}
                        >
                          {dateTimeIST(m.created_at)}
                          {!inbound && m.status && (
                            <span className="ml-1 uppercase">{m.status}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={threadEndRef} />
            </div>

            <div className="flex items-end gap-2 border-t border-line p-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={2}
                placeholder="Type a message… (Enter to send)"
                className="min-h-[44px] flex-1 resize-none rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              <Button variant="primary" size="sm" loading={sending} onClick={handleSend}>
                Send
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
