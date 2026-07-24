import { prisma } from "@/db/client";
import { searchNeoId } from "@/queries/searchNeoId";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const results = q ? await searchNeoId(prisma, q) : [];

  return (
    <div className="view">
      <div className="phead">
        <p className="eye">Shortlist lookup</p>
        <h1>Check shortlist</h1>
        <p>
          Search any Neo ID — full or partial — against every shortlist pulled from the mails, including Excel
          attachments and IDs listed inline. Nothing you type is stored.
        </p>
      </div>

      <div className="panel">
        <form className="search">
          <input name="q" defaultValue={q} placeholder="e.g. 3D8V — partial match works" aria-label="Neo ID" />
          <button type="submit">Check</button>
        </form>
        <p className="hint">Enter the first few characters if you only remember part of your ID.</p>

        {q && results.length === 0 && (
          <div className="results">
            <div className="empty">
              No shortlist matches for <b>{q}</b>. New shortlists drop through the season — check back after the next
              mail lands.
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="results">
            {results.map((r) =>
              r.mailEvent.company ? (
                <Link key={r.id} href={`/companies/${r.mailEvent.company.id}`} className="res">
                  <span className="tick" aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <b>{r.neoId}</b>
                    <small>found in a shortlist mail</small>
                  </div>
                  <span className="stage">{r.mailEvent.company.name}</span>
                </Link>
              ) : (
                <div key={r.id} className="res" style={{ cursor: "default" }}>
                  <span className="tick" aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <b>{r.neoId}</b>
                    <small>found in a shortlist mail</small>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      <div className="callout" style={{ marginTop: 16 }}>
        <span className="ci">i</span>
        <div>
          Shortlists are read straight from the placement-cell mail. If one just went out, give ingestion a minute to
          catch up before searching.
        </div>
      </div>
    </div>
  );
}
