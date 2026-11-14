"use client";

import TokenIcon from "@/components/TokenIcon";

export type EvidenceAttachment = {
  id: string;
  url: string;
  caption?: string | null;
  sort_order?: number | null;
  watermarked?: boolean | null;
};

export type AgreementEvidenceProps = {
  title: string;
  description?: string | null;
  amount: string;
  currency: string;
  assetCode?: string | null;
  escrowType?: string | null;
  agreedDeadline?: string | null;
  adminReviewDeadline?: string | null;
  conditionType?: string | null;
  serialOrRef?: string | null;
  deliveryMethod?: string | null;
  creatorChecklist?: Record<string, boolean> | null;
  counterpartyChecklist?: Record<string, boolean> | null;
  creatorAcceptedAt?: string | null;
  counterpartyAcceptedAt?: string | null;
  attachments?: EvidenceAttachment[];
  txSignatures?: { label: string; signature: string }[];
};

function fmt(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function AgreementEvidence(props: AgreementEvidenceProps) {
  const atts = [...(props.attachments ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Agreement evidence</h2>
      <p className="mt-1 text-sm text-gray-500">
        Agreement record for this deal. Delivery disputes use chat and extra evidence.
      </p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-gray-500">Title</dt>
          <dd className="font-medium">{props.title}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Amount</dt>
          <dd className="font-medium">
            <span className="inline-flex items-center gap-1.5">
              {props.amount}
              <TokenIcon code={props.assetCode || props.currency} size={16} />
              {props.assetCode || props.currency}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Escrow type</dt>
          <dd className="font-medium">{props.escrowType ?? "one_time"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Agreed trade deadline</dt>
          <dd className="font-medium">{fmt(props.agreedDeadline)}</dd>
        </div>
        {props.adminReviewDeadline ? (
          <div>
            <dt className="text-gray-500">Admin review window</dt>
            <dd className="font-medium">{fmt(props.adminReviewDeadline)}</dd>
          </div>
        ) : null}
        {props.conditionType ? (
          <div>
            <dt className="text-gray-500">Condition</dt>
            <dd className="font-medium">{props.conditionType}</dd>
          </div>
        ) : null}
        {props.serialOrRef ? (
          <div>
            <dt className="text-gray-500">Serial / ref</dt>
            <dd className="font-medium break-all">{props.serialOrRef}</dd>
          </div>
        ) : null}
        {props.deliveryMethod ? (
          <div>
            <dt className="text-gray-500">Delivery</dt>
            <dd className="font-medium">{props.deliveryMethod}</dd>
          </div>
        ) : null}
      </dl>

      {props.description ? (
        <div className="mt-4">
          <p className="text-sm text-gray-500">Description</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{props.description}</p>
        </div>
      ) : null}

      {atts.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium">Item photos</p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {atts.map((a) => (
              <figure key={a.id} className="overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.caption || "Evidence"} className="h-32 w-full object-cover" />
                <figcaption className="truncate px-2 py-1 text-xs text-gray-600">
                  {a.caption || (a.watermarked ? "TrustLayer watermarked" : "Photo")}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 text-xs text-gray-600 sm:grid-cols-2">
        <div>
          <p className="font-medium text-gray-800">Creator checklist</p>
          <p>Accepted: {fmt(props.creatorAcceptedAt)}</p>
          <pre className="mt-1 overflow-auto rounded bg-gray-50 p-2">
            {JSON.stringify(props.creatorChecklist ?? {}, null, 2)}
          </pre>
        </div>
        <div>
          <p className="font-medium text-gray-800">Counterparty acknowledgement</p>
          <p>Accepted: {fmt(props.counterpartyAcceptedAt)}</p>
          <pre className="mt-1 overflow-auto rounded bg-gray-50 p-2">
            {JSON.stringify(props.counterpartyChecklist ?? {}, null, 2)}
          </pre>
        </div>
      </div>

      {props.txSignatures && props.txSignatures.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium">On-chain transactions</p>
          <ul className="mt-2 space-y-1 text-sm">
            {props.txSignatures.map((t) => (
              <li key={t.signature}>
                <span className="text-gray-500">{t.label}: </span>
                <a
                  className="break-all text-blue-600 underline"
                  href={`https://explorer.solana.com/tx/${t.signature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.signature.slice(0, 24)}…
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
