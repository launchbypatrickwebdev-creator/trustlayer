"use client";

import { useEffect, useState } from "react";
import { MonitorSmartphone, ShieldCheck } from "lucide-react";

export default function DeviceBinding() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  useEffect(() => {
    let key = window.localStorage.getItem("trustlayer_device_key");
    if (!key) {
      key = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
      window.localStorage.setItem("trustlayer_device_key", key);
    }
    fetch("/api/risk/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceKey: key }),
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="flex items-start gap-3">
      <div className="tl-icon">
        <MonitorSmartphone size={17} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[var(--tl-ink)]">
            Device awareness
          </p>
          <ShieldCheck size={14} className="text-[var(--tl-emerald)]" />
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--tl-muted)]">
          TrustLayer records a privacy-preserving device binding as one signal
          for account protection and abuse prevention.
        </p>
        <p className="mt-2 text-[11px] font-medium text-[var(--tl-muted)]">
          {status === "ready"
            ? "Device linked to this account"
            : status === "loading"
              ? "Checking device…"
              : "Device signal unavailable"}
        </p>
      </div>
    </div>
  );
}