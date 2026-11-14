import TokenIcon from "@/components/TokenIcon";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";
import { notFound, redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/domain/admin";
import PageBackLink from "@/components/layout/PageBackLink";
import AdminUserActions from "@/components/admin/AdminUserActions";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { id } = await params;
    const { admin } = await requireAdminUser();

    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!profile) notFound();

    const [{ data: wallets }, { data: devices }, { data: deals }, { data: verification }] =
      await Promise.all([
        admin
          .from("wallets")
          .select("network, asset_code, address, is_primary")
          .eq("user_id", id),
        (admin as any)
          .from("device_bindings")
          .select("id, device_hash, label, last_seen_at, created_at")
          .eq("user_id", id)
          .order("last_seen_at", { ascending: false }),
        admin
          .from("deals")
          .select("id, deal_code, title, status, amount, currency, created_at")
          .or(
            `created_by.eq.${id},buyer_id.eq.${id},seller_id.eq.${id}`
          )
          .order("created_at", { ascending: false })
          .limit(20),
        (admin as any)
          .from("verification_profiles")
          .select("*")
          .eq("user_id", id)
          .maybeSingle(),
      ]);

    return (
      <AdminShell active="users">
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <PageBackLink href="/admin/users" label="Back to users" />
          <h1 className="text-3xl font-black">
            {profile.full_name || profile.display_name || profile.username || "User"}
          </h1>
          <p className="mt-1 font-mono text-xs text-[var(--tl-muted)]">
            {profile.id}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Info label="Username" value={profile.username ? `@${profile.username}` : "—"} />
            <Info label="Status" value={profile.account_status || "active"} />
            <Info label="Country" value={profile.country || "—"} />
            <Info label="Region" value={profile.region || "—"} />
            <Info label="Phone" value={profile.phone || "—"} />
            <Info
              label="Joined"
              value={
                profile.created_at
                  ? new Date(profile.created_at).toLocaleString()
                  : "—"
              }
            />
          </div>

          <AdminUserActions
            userId={profile.id}
            status={profile.account_status || "active"}
          />

          <section className="mt-8">
            <h2 className="font-black">Device hashes</h2>
            <div className="mt-3 space-y-2">
              {(devices ?? []).length === 0 ? (
                <p className="text-sm text-[var(--tl-muted)]">No devices recorded.</p>
              ) : (
                (devices ?? []).map((d: any) => (
                  <div
                    key={d.id}
                    className="rounded-xl border border-[var(--tl-line)] bg-[#071a2d] px-4 py-3 font-mono text-xs"
                  >
                    <p className="break-all">{d.device_hash}</p>
                    <p className="mt-1 text-[var(--tl-muted)]">
                      Last seen{" "}
                      {d.last_seen_at
                        ? new Date(d.last_seen_at).toLocaleString()
                        : "—"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="font-black">Wallets</h2>
            <div className="mt-3 space-y-2">
              {(wallets ?? []).map((w: any, i: number) => (
                <div
                  key={i}
                  className="rounded-xl border border-[var(--tl-line)] px-4 py-3 text-sm"
                >
                  <span className="inline-flex items-center gap-1">
                    <TokenIcon code={w.asset_code} size={14} />
                    {w.asset_code} · {w.network}
                  </span>
                  <p className="mt-1 break-all font-mono text-xs text-[var(--tl-muted)]">
                    {w.address}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="font-black">Recent deals</h2>
            <ul className="mt-3 space-y-2">
              {(deals ?? []).map((d: any) => (
                <li key={d.id}>
                  <Link
                    href={`/deals/${d.id}`}
                    className="text-sm font-semibold text-[var(--tl-teal)] no-underline"
                  >
                    {d.deal_code} · {d.title} · {d.status}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {verification ? (
            <section className="mt-8 rounded-2xl border border-[var(--tl-line)] p-4 text-sm">
              <h2 className="font-black">Verification</h2>
              <p className="mt-2 text-[var(--tl-muted)]">
                Fiat L{verification.fiat_level} · status{" "}
                {verification.verification_status}
              </p>
            </section>
          ) : null}
        </div>
      </main>
      </AdminShell>
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required.")
      redirect("/login");
    if (error instanceof Error && error.message === "Admin access required.")
      redirect("/dashboard");
    throw error;
  }
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--tl-line)] bg-[#071a2d] p-4">
      <p className="text-xs font-bold uppercase text-[var(--tl-muted)]">
        {label}
      </p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
