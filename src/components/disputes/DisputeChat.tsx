"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileImage,
  MessageCircle,
  Paperclip,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";

type Message = {
  id: string;
  sender_user_id: string;
  sender_role: "buyer" | "seller" | "admin";
  body: string | null;
  attachment_url: string | null;
  created_at: string;
};

interface Props {
  disputeId: string;
  canPost: boolean;
  viewerRole: "buyer" | "seller" | "admin";
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function roleLabel(role: Message["sender_role"]) {
  if (role === "admin") return "TrustLayer admin";
  return role === "buyer" ? "Buyer" : "Seller";
}

export default function DisputeChat({
  disputeId,
  canPost,
  viewerRole,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/disputes/${disputeId}/messages`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load messages.");
      setMessages(data.messages ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chat.");
    }
  }, [disputeId]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("trustlayer:deal-updated", handler);
    return () => window.removeEventListener("trustlayer:deal-updated", handler);
  }, [load]);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function send() {
    if (!canPost) return;
    if (!body.trim() && !file) {
      setError("Write a message or attach an image.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      if (body.trim()) form.append("body", body.trim());
      if (file) form.append("file", file);

      const res = await fetch(`/api/disputes/${disputeId}/messages`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send.");

      setBody("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[26px] border border-[#1e344b] bg-[#08182b] text-[#edf6ff] shadow-[0_22px_65px_rgba(0,0,0,0.24)]">
      <div className="relative overflow-hidden border-b border-[#1b344d] bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.15),transparent_45%),linear-gradient(135deg,#10233d,#0a192c_68%,#071426)] px-5 py-5 sm:px-7">
        <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-300 shadow-[0_0_28px_rgba(16,185,129,0.08)]">
              <MessageCircle size={22} strokeWidth={1.8} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">Dispute room</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Shared record
                </span>
              </div>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-300">
                Keep the discussion, context, and supporting evidence together while this transaction is reviewed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/25 px-3 py-2 text-xs text-slate-300">
            <ShieldCheck size={15} className="text-emerald-300" />
            <span>Your role:</span>
            <span className="font-semibold capitalize text-white">{viewerRole}</span>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-slate-950/20 px-3 py-2.5 text-xs text-slate-300">
            <MessageCircle size={15} className="text-cyan-300" /> Buyer, seller and admin thread
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-slate-950/20 px-3 py-2.5 text-xs text-slate-300">
            <FileImage size={15} className="text-emerald-300" /> Image evidence supported
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-slate-950/20 px-3 py-2.5 text-xs text-slate-300">
            <Clock3 size={15} className="text-amber-300" /> Keep messages factual and clear
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Conversation</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              {messages.length} {messages.length === 1 ? "message" : "messages"} in this room
            </p>
          </div>
          <span className="rounded-lg border border-[#203a53] bg-[#0c2036] px-2.5 py-1.5 text-[11px] font-medium text-slate-300">
            {canPost ? "Replies enabled" : "Read only"}
          </span>
        </div>

        <div
          ref={messageListRef}
          className="max-h-[440px] min-h-[220px] space-y-3 overflow-y-auto rounded-2xl border border-[#1a334b] bg-[#061426]/80 p-3 sm:p-4"
        >
          {messages.length === 0 ? (
            <div className="flex min-h-[190px] flex-col items-center justify-center px-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-300">
                <MessageCircle size={24} strokeWidth={1.5} />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-100">The conversation starts here</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
                Share a clear explanation or attach relevant evidence so everyone can understand the issue.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isAdmin = m.sender_role === "admin";
              const isViewerRole = m.sender_role === viewerRole;
              return (
                <article
                  key={m.id}
                  className={`rounded-2xl border p-3.5 sm:p-4 ${
                    isAdmin
                      ? "border-amber-300/20 bg-[linear-gradient(135deg,rgba(212,175,55,0.08),rgba(11,29,48,0.82))]"
                      : isViewerRole
                        ? "border-emerald-300/15 bg-[linear-gradient(135deg,rgba(16,185,129,0.07),rgba(10,27,46,0.92))]"
                        : "border-[#1b344c] bg-[#0b1d31]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold ${
                          isAdmin
                            ? "bg-amber-300/15 text-amber-200"
                            : m.sender_role === "buyer"
                              ? "bg-cyan-300/10 text-cyan-200"
                              : "bg-emerald-300/10 text-emerald-200"
                        }`}
                      >
                        {isAdmin ? "TL" : m.sender_role === "buyer" ? "BY" : "SL"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100">{roleLabel(m.sender_role)}</span>
                          {isViewerRole && (
                            <span className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-200">
                              Your side
                            </span>
                          )}
                        </div>
                        <span className="mt-0.5 block text-[11px] text-slate-500">{formatMessageTime(m.created_at)}</span>
                      </div>
                    </div>
                    {isAdmin && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-amber-200/80">
                        <ShieldCheck size={12} /> Platform review
                      </span>
                    )}
                  </div>
                  {m.body && (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{m.body}</p>
                  )}
                  {m.attachment_url && (
                    <a
                      href={m.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex max-w-full flex-col overflow-hidden rounded-xl border border-[#29445c] bg-[#061426] transition hover:border-emerald-300/40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.attachment_url}
                        alt="Dispute evidence attachment"
                        className="max-h-64 max-w-full object-contain"
                      />
                      <span className="border-t border-[#20384e] px-3 py-2 text-[11px] text-slate-400">Open attached evidence ↗</span>
                    </a>
                  )}
                </article>
              );
            })
          )}
        </div>

        {canPost ? (
          <div className="mt-4 rounded-2xl border border-[#1b344c] bg-[#0a1b2e] p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-300/10 text-emerald-300">
                <MessageCircle size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Add to the record</p>
                <p className="text-[11px] text-slate-400">Messages and images are shared with the dispute participants.</p>
              </div>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Explain what happened, add context, or respond to a question…"
              className="w-full resize-y rounded-xl border border-[#29435c] bg-[#061426] px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-400/60 focus:ring-4 focus:ring-emerald-400/10"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  id={`dispute-evidence-${disputeId}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                <label
                  htmlFor={`dispute-evidence-${disputeId}`}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#29435c] bg-[#10243a] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-300/40 hover:bg-[#142b43]"
                >
                  <Paperclip size={15} className="text-emerald-300" /> Attach image
                </label>
                {file && (
                  <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.07] px-2.5 py-2 text-[11px] text-emerald-100">
                    <FileImage size={13} className="shrink-0" />
                    <span className="max-w-[180px] truncate">{file.name}</span>
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="rounded p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                    >
                      <X size={13} />
                    </button>
                  </span>
                )}
                <span className="text-[10px] text-slate-500">Images: JPG, PNG, WEBP, GIF · 2,000 characters max</span>
              </div>
              <button
                type="button"
                onClick={send}
                disabled={loading || (!body.trim() && !file)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300/30 bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-2.5 text-sm font-bold text-[#04251f] shadow-[0_8px_22px_rgba(16,185,129,0.12)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send message"}
                {!loading && <Send size={15} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[#29405a] bg-[#0c2035] p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-400/10 text-slate-300">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">This room is read-only</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">The dispute has been resolved or closed, so new messages are disabled.</p>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-300/20 bg-rose-400/[0.07] px-3.5 py-3 text-sm text-rose-200">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <p className="mt-3 text-center text-[10px] leading-5 text-slate-500">
          Keep discussion relevant to this transaction. Share only evidence that helps clarify the dispute.
        </p>
      </div>
    </section>
  );
}
