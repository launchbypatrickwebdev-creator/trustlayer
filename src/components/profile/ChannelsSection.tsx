"use client";

import { useState } from "react";
import { ChevronDown, MessageCircle } from "lucide-react";
import TelegramSyncCard from "@/components/profile/TelegramSyncCard";

type ChannelRow = {
  channel?: string;
  channel_user_id?: string | null;
  status?: string;
};

const CHANNELS = [
  {
    id: "telegram" as const,
    label: "Telegram",
    hint: "Sync with TrustLayer bot",
    ready: true,
  },
  {
    id: "whatsapp" as const,
    label: "WhatsApp",
    hint: "Future adapter",
    ready: false,
  },
  {
    id: "discord" as const,
    label: "Discord",
    hint: "Future adapter",
    ready: false,
  },
];

export default function ChannelsSection({
  channels,
  telegramUserId,
  telegramUsername,
}: {
  channels: ChannelRow[];
  telegramUserId?: string | number | null;
  telegramUsername?: string | null;
}) {
  const [openSection, setOpenSection] = useState(false);
  const [openChannel, setOpenChannel] = useState<string | null>(null);

  const channelMap = new Map(
    (channels ?? []).map((c) => [String(c.channel), c])
  );
  const tg = channelMap.get("telegram");
  const tgConnected = Boolean(tg || telegramUserId);

  const anyConnected = CHANNELS.some((ch) => {
    if (ch.id === "telegram") return tgConnected;
    return Boolean(channelMap.get(ch.id));
  });

  return (
    <section className="tl-card overflow-hidden p-0">
      {/* Header — toggles whole section */}
      <button
        type="button"
        onClick={() => {
          setOpenSection((v) => !v);
          if (openSection) setOpenChannel(null);
        }}
        className="flex w-full items-center gap-3 px-6 py-5 text-left transition hover:bg-[var(--tl-paper)]"
        aria-expanded={openSection}
      >
        <span className="tl-icon shrink-0">
          <MessageCircle size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-black">Connected channels</h2>
          <p className="text-xs text-[var(--tl-muted)]">
            Bot adapters link to this identity — not a second account
          </p>
        </div>
        <span className="rounded-full border border-[var(--tl-line)] px-2 py-1 text-[10px] font-semibold text-[var(--tl-muted)]">
          {anyConnected ? "Linked" : "None linked"}
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-[var(--tl-muted)] transition-transform ${
            openSection ? "rotate-180" : ""
          }`}
        />
      </button>

      {openSection ? (
        <div className="space-y-2 border-t border-[var(--tl-line)] px-4 pb-4 pt-3">
          {CHANNELS.map((ch) => {
            const row = channelMap.get(ch.id);
            const connected =
              ch.id === "telegram" ? tgConnected : Boolean(row);
            const expanded = openChannel === ch.id;

            return (
              <div
                key={ch.id}
                className="overflow-hidden rounded-xl border border-[var(--tl-line)]"
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenChannel((cur) => (cur === ch.id ? null : ch.id))
                  }
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--tl-paper)]"
                  aria-expanded={expanded}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{ch.label}</p>
                    <p className="text-xs text-[var(--tl-muted)]">
                      {connected
                        ? row?.channel_user_id ||
                          (ch.id === "telegram" && telegramUserId
                            ? String(telegramUserId)
                            : "Connected")
                        : ch.hint}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                        connected
                          ? "bg-emerald-50 text-emerald-800"
                          : "border border-[var(--tl-line)] text-[var(--tl-muted)]"
                      }`}
                    >
                      {connected ? "Connected" : "Not connected"}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-[var(--tl-muted)] transition-transform ${
                        expanded ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>

                {expanded ? (
                  <div className="border-t border-[var(--tl-line)] bg-[var(--tl-paper)] px-3 py-3">
                    {ch.id === "telegram" ? (
                      <TelegramSyncCard
                        connected={tgConnected}
                        channelUserId={
                          row?.channel_user_id ||
                          (telegramUserId != null
                            ? String(telegramUserId)
                            : null)
                        }
                        telegramUsername={telegramUsername}
                      />
                    ) : (
                      <p className="text-xs leading-5 text-[var(--tl-muted)]">
                        {ch.label} will use the same TrustLayer identity model
                        as Telegram. Adapter not enabled yet.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
