import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/domain/admin";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id } = await context.params;
    const body = await request.json();
    const status = String(body.accountStatus || "");
    if (!["active", "banned", "restricted"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ account_status: status })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, accountStatus: status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update user.",
      },
      { status: 400 }
    );
  }
}

/**
 * Hard-delete a user: Auth user + cascade profile-related rows where FKs allow.
 * Prefer ban for users with live funded escrows.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user: adminUser } = await requireAdminUser();
    const { id } = await context.params;
    if (id === adminUser.id) {
      return NextResponse.json(
        { error: "You cannot delete your own admin account from this screen." },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdminClient();

    // Block delete if any funded/non-terminal crypto settlement remains
    const { data: live } = await admin
      .from("crypto_settlements")
      .select("id, onchain_status, deal_id")
      .or(
        // settlements don't have user_id always — check deals involving user
        `deal_id.in.(${
          (
            await admin
              .from("deals")
              .select("id")
              .or(
                `created_by.eq.${id},buyer_id.eq.${id},seller_id.eq.${id}`
              )
          ).data
            ?.map((d: any) => d.id)
            .join(",") || "00000000-0000-0000-0000-000000000000"
        })`
      )
      .eq("onchain_status", "funded")
      .limit(1);

    // Safer funded check via deals join
    const { data: userDeals } = await admin
      .from("deals")
      .select("id")
      .or(`created_by.eq.${id},buyer_id.eq.${id},seller_id.eq.${id}`);
    const dealIds = (userDeals ?? []).map((d: any) => d.id);
    if (dealIds.length) {
      const { data: funded } = await admin
        .from("crypto_settlements")
        .select("id")
        .in("deal_id", dealIds)
        .eq("onchain_status", "funded")
        .limit(1);
      if (funded?.length) {
        return NextResponse.json(
          {
            error:
              "User has funded escrow(s). Resolve or cancel on-chain first, then delete.",
          },
          { status: 409 }
        );
      }
    }

    // Delete auth user (cascades profile if FK on delete cascade)
    const { error: authErr } = await admin.auth.admin.deleteUser(id);
    if (authErr) {
      // Fallback: mark banned if auth delete fails
      await admin
        .from("profiles")
        .update({ account_status: "banned" })
        .eq("id", id);
      throw new Error(authErr.message);
    }

    // Ensure profile gone
    await admin.from("profiles").delete().eq("id", id);

    return NextResponse.json({ ok: true, deleted: id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to delete user.",
      },
      { status: 400 }
    );
  }
}
