"use client";
import { useState } from "react";
import Link from "next/link";
import { checkShortlist, type ShortlistMatch } from "./actions";
import { saveNeoId, dismissNeoIdPrompt } from "@/auth/neoIdVaultActions";

type SavedState = "none" | "asked" | "saved";

export default function ShortlistChecker({
  savedState,
  savedNeoId,
}: {
  savedState: SavedState;
  savedNeoId?: string;
}) {
  const [consent, setConsent] = useState(false);
  const [neoId, setNeoId] = useState(savedNeoId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<ShortlistMatch[] | null>(null);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [savePromptDone, setSavePromptDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMatches(null);
    try {
      const res = await checkShortlist(neoId);
      if (res.error) {
        setError(res.error);
      } else {
        setMatches(res.matches ?? []);
        if (savedState === "none" && !savePromptDone) setShowSavePrompt(true);
      }
    } catch {
      setError("Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveNeoId() {
    setSaving(true);
    try {
      await saveNeoId(neoId);
    } finally {
      setSaving(false);
      setSavePromptDone(true);
      setShowSavePrompt(false);
    }
  }

  async function onDismissPrompt() {
    setSaving(true);
    try {
      await dismissNeoIdPrompt();
    } finally {
      setSaving(false);
      setSavePromptDone(true);
      setShowSavePrompt(false);
    }
  }

  return (
    <div className="panel">
      <h3>Check your shortlist status</h3>
      <p className="psub">
        Enter your full Neo ID to see which companies shortlisted you. It&rsquo;s checked against one-way
        fingerprints and <strong>never stored</strong> for the check itself.
      </p>

      <label
        style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: ".82rem", color: "var(--muted)", marginBottom: 14 }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 3, flex: "none" }}
        />
        <span>
          I&rsquo;m a current-batch student authorized to view these shortlists, and I understand my Neo ID is used
          only for this check. Shortlists come from placement-cell mail and may contain errors — I&rsquo;ll confirm
          anything important against the original mail.
        </span>
      </label>

      <form className="search" onSubmit={onSubmit}>
        <input
          value={neoId}
          onChange={(e) => setNeoId(e.target.value)}
          placeholder="e.g. O3D8V4U8"
          maxLength={10}
          autoComplete="off"
          spellCheck={false}
          aria-label="Your Neo ID"
          disabled={!consent}
        />
        <button type="submit" disabled={!consent || busy || neoId.trim().length < 6}>
          {busy ? "Checking…" : "Check"}
        </button>
      </form>

      {error && (
        <div className="results">
          <div className="empty">{error}</div>
        </div>
      )}

      {showSavePrompt && (
        <div className="callout" style={{ marginTop: 14 }}>
          <span className="ci">?</span>
          <div>
            <b>Save this Neo ID to your account for next time?</b> It&rsquo;ll be encrypted and only used to
            pre-fill this form.
            <div className="formrow" style={{ marginTop: 8 }}>
              <button type="button" className="btn pri" disabled={saving} onClick={onSaveNeoId}>
                Save it
              </button>
              <button type="button" className="btn" disabled={saving} onClick={onDismissPrompt}>
                No, don&rsquo;t ask again
              </button>
            </div>
          </div>
        </div>
      )}

      {matches && (
        <div className="results">
          {matches.length === 0 ? (
            <div className="empty">
              <b>{neoId.trim().toUpperCase()}</b> isn&rsquo;t on any shortlist on record yet. New shortlists arrive
              through the season — check back after the next mail lands.
            </div>
          ) : (
            matches.map((m) => (
              <Link key={m.companyId + m.subject} href={`/companies/${m.companyId}`} className="res">
                <span className="tick" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <b>{m.company}</b>
                  <small>{m.subject}</small>
                </div>
                <span className="stage">Shortlisted</span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
