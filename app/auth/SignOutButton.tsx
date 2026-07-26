"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className="btn danger"
      style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut({ callbackUrl: "/" });
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
