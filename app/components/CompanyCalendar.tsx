import Link from "next/link";
import type { Company } from "@prisma/client";
import ProgramBadge from "./ProgramBadge";

function initials(name: string): string {
  return name.replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 3).toUpperCase() || "—";
}

export default function CompanyCalendar({ companies }: { companies: Company[] }) {
  const byDate = new Map<string, Company[]>();
  // Drives whose date the mail never stated. Previously skipped outright,
  // which made them unreachable from this page entirely.
  const undated: Company[] = [];
  for (const c of companies) {
    if (!c.visitDate) {
      undated.push(c);
      continue;
    }
    const key = c.visitDate.toISOString().slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), c]);
  }

  if (byDate.size === 0 && undated.length === 0) {
    return (
      <div className="empty">
        No company visits in this range. Try a different month, or widen the date range.
      </div>
    );
  }

  return (
    <div className="feed">
      {[...byDate.entries()].map(([date, list]) => {
        const pretty = new Date(date).toLocaleDateString(undefined, {
          weekday: "short",
          day: "2-digit",
          month: "short",
        });
        return (
          <div key={date} className="panel">
            <div className="panelhead">
              <h3>{pretty}</h3>
              <span className="mono">
                {list.length} visit{list.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="colist">
              {list.map((c) => (
                <Link key={c.id} href={`/companies/${c.id}`} className="corow">
                  <span className="cc">{initials(c.name)}</span>
                  <span className="cn">
                    <b>
                      {c.name} <ProgramBadge program={c.program} />
                    </b>
                    {(c.category || c.ctc) && <small>{[c.category, c.ctc].filter(Boolean).join(" · ")}</small>}
                  </span>
                  <span className="cmeta">
                    <span className="last" aria-hidden="true">
                      →
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {undated.length > 0 && (
        <div className="panel">
          <div className="panelhead">
            <h3>Date not announced</h3>
            <span className="mono">
              {undated.length} drive{undated.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="colist">
            {undated.map((c) => (
              <Link key={c.id} href={`/companies/${c.id}`} className="corow">
                <span className="cc">{initials(c.name)}</span>
                <span className="cn">
                  <b>
                    {c.name} <ProgramBadge program={c.program} />
                  </b>
                  {(c.category || c.ctc) && <small>{[c.category, c.ctc].filter(Boolean).join(" · ")}</small>}
                </span>
                <span className="cmeta">
                  <span className="last" aria-hidden="true">
                    →
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
