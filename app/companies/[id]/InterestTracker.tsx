"use client";
import { useState, useTransition } from "react";
import { setInterest } from "../../dashboard/actions";

const STATUSES = ["interested", "registered", "attended", "not interested"];

export default function InterestTracker({ companyId, initialStatus }: { companyId: string; initialStatus: string | null }) {
  const [status, setStatus] = useState(initialStatus ?? "");
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string) {
    setStatus(next);
    startTransition(async () => {
      await setInterest(companyId, next);
    });
  }

  return (
    <div className="callout" style={{ alignItems: "center", gap: 12 }}>
      <label htmlFor="interest-status" className="mono" style={{ fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".08em" }}>
        Track my interest
      </label>
      <select
        id="interest-status"
        value={status}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: ".82rem",
          padding: "7px 10px",
          borderRadius: 8,
          border: "1px solid var(--hair)",
          background: "var(--card)",
          color: "var(--ink)",
        }}
      >
        <option value="" disabled>
          Not tracked
        </option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {isPending && <span className="mono" style={{ fontSize: ".72rem", color: "var(--muted)" }}>saving…</span>}
    </div>
  );
}
