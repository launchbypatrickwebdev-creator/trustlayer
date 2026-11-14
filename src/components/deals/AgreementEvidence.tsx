import TokenIcon from "@/components/TokenIcon";
import Image from "next/image";

export type EvidenceAttachment = {
  id: string;
  url: string;
  caption?: string | null;
  sort_order?: number;
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
  creatorAcceptedAt?: string | null;
  counterpartyAcceptedAt?: string | null;
  attachments?: EvidenceAttachment[];
  txSignatures?: { label: string; signature: string }[];
};

function fmt(dt?: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

export default function AgreementEvidence(props: AgreementEvidenceProps) {
  const attachments = [...(props.attachments ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Agreement evidence</h2>
      <p className="mt-1 text-sm text-gray-500">
        Create-time record of what both parties agreed. Delivery disputes use chat
        evidence separately.
      </p>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
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
        {props.adminReviewDeadline && (
          <div>
            <dt className="text-gray-500">Admin review window</dt>
            <dd className="font-medium">{fmt(props.adminReviewDeadline)}</dd>
          </div>
        )}
        {props.conditionType && (
          <div>
            <dt className="text-gray-500">Condition</dt>
            <dd className="font-medium">{props.conditionType}</dd>
          </div>
        )}
        {props.serialOrRef && (
          <div>
            <dt className="text-gray-500">Serial / ref</dt>
            <dd className="font-medium font-mono text-xs">{props.serialOrRef}</dd>
          </div>
        )}
        {props.deliveryMethod && (
          <div>
            <dt className="text-gray-500">Delivery</dt>
            <dd className="font-medium">{props.deliveryMethod}</dd>
          </div>
        )}
      </dl>

      {props.description && (
        <div className="mt-4">
          <p className="text-sm text-gray-500">Description</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{props.description}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-600">
        <span>
          Creator terms accepted:{" "}
          <strong>{fmt(props.creatorAcceptedAt)}</strong>
        </span>
        <span>
          Counterparty ack:{" "}
          <strong>{fmt(props.counterpartyAcceptedAt)}</strong>
        </span>
      </div>

      {attachments.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-medium">Item / service photos</p>
          <ul className="mt-2 grid gap-3 sm:grid-cols-3">
            {attachments.map((a) => (
              <li key={a.id} className="overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt={a.caption || "Deal evidence"}
                  className="h-36 w-full object-cover"
                />
                {a.caption && (
                  <p className="border-t px-2 py-1 text-xs text-gray-600">
                    {a.caption}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {props.txSignatures && props.txSignatures.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-medium">On-chain transactions</p>
          <ul className="mt-2 space-y-1 text-xs">
            {props.txSignatures.map((t) => (
              <li key={t.signature}>
                <span className="text-gray-500">{t.label}: </span>
                <a
                  className="break-all text-blue-600 underline"
                  href={`https://explorer.solana.com/tx/${t.signature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.signature}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
