"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function SignInButton({ callbackUrl }: { callbackUrl?: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className="btn pri"
      style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signIn("google", { callbackUrl: callbackUrl ?? "/" });
      }}
    >
      {busy ? "Redirecting…" : "Sign in with Google"}
    </button>
  );
}
