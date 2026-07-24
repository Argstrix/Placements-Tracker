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
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="interest-status" className="text-gray-500">
        Track my interest:
      </label>
      <select
        id="interest-status"
        value={status}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="border rounded px-2 py-1"
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
    </div>
  );
}
