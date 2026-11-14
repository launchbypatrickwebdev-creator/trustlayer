"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import ProfileEditor from "@/components/profile/ProfileEditor";

type Props = {
  username: string;
  displayName: string;
  fullName: string;
  phone: string;
  country: string;
  region: string;
};

export default function ProfileEditSection(props: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onHash() {
      if (window.location.hash === "#edit-profile") setOpen(true);
    }
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <section
      id="edit-profile"
      className="mt-5 scroll-mt-24 rounded-[20px] border border-[var(--tl-line)] bg-[var(--tl-card)]"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-bold text-[var(--tl-ink)]">Edit profile</p>
          <p className="mt-0.5 text-xs text-[var(--tl-muted)]">
            Username, display name, full legal name, phone, country — and account
            deletion.
          </p>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-[var(--tl-muted)] transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="border-t border-[var(--tl-line)] px-5 py-5">
          <ProfileEditor
            username={props.username}
            displayName={props.displayName}
            fullName={props.fullName}
            phone={props.phone}
            country={props.country}
            region={props.region}
          />
        </div>
      )}
    </section>
  );
}