"use client";

import { useEffect, useState } from "react";

type Attachment = {
  id: string;
  kind: string;
  url: string | null;
  file_name: string | null;
  created_at: string;
  uploaded_by?: string | null;
  caption?: string | null;
};

export default function DealAttachments({ dealId }: { dealId: string }) {
  const [items, setItems] = useState<Attachment[]>([]);

  useEffect(() => {
    const load = () =>
      fetch(`/api/deals/${dealId}/attachments`)
        .then((r) => r.json())
        .then((d) => setItems(d.attachments ?? []))
        .catch(() => {});
    load();
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.dealId === dealId) load();
    };
    window.addEventListener("trustlayer:deal-updated", handler);
    return () => window.removeEventListener("trustlayer:deal-updated", handler);
  }, [dealId]);

  if (items.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-gray-500">
        Agreement evidence ({items.length})
      </h3>
      <p className="mt-1 text-xs text-gray-500">
        Photos from either party. Used on dispute review.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {items.map((a) =>
          a.url ? (
            <div key={a.id} className="w-28">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.file_name || "Deal item"}
                className="h-28 w-28 rounded-lg border object-cover"
              />
              {a.caption && (
                <p className="mt-1 truncate text-[10px] text-gray-500">
                  {a.caption}
                </p>
              )}
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
