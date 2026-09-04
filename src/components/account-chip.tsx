"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { signOut } from "@/app/login/actions";

export type Account = { email: string } | null;

/**
 * Sits in the passport header. Signed-in users see who they are and can sign
 * out; guests get a compact sign-in action. Both states stay small so the
 * passport title keeps the room.
 */
export function AccountChip({ account }: { account: Account }) {
  if (!account) {
    return (
      <Link href="/login" className="account-chip account-chip--guest" aria-label="Sign in" title="Sign in">
        <UserRound size={18} aria-hidden="true" />
      </Link>
    );
  }

  return (
    <form action={signOut} className="account-chip" title={account.email}>
      <span className="account-chip__avatar" aria-hidden="true"><UserRound size={13} /></span>
      <span className="account-chip__email">{account.email}</span>
      <button type="submit" aria-label="Sign out"><LogOut size={13} aria-hidden="true" /></button>
    </form>
  );
}
