import { prisma } from "@/db/client";
import { getIngestionLogSummary } from "@/queries/getIngestionLogSummary";
import { retryOne } from "./actions";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getServerSession(buildAuthOptions());
  const role = session?.user?.email ? (await isAuthorized(session.user.email, prisma)).role : null;
  if (role !== "admin") notFound();

  const [logs, issues] = await Promise.all([
    getIngestionLogSummary(prisma),
    prisma.reportedIssue.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { company: true } }),
  ]);

  const ok = logs.filter((l) => l.status === "SUCCESS").length;
  const failed = logs.filter((l) => l.status === "FAILED").length;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="view">
      <div className="phead">
        <p className="eye">Admin</p>
        <h1>Ingestion console</h1>
        <p>What the pipeline has processed, what failed, and what students have flagged. Retry a failed mail below.</p>
      </div>

      <div className="stats" style={{ marginBottom: 22 }}>
        <div className="stat">
          <div className="n sig">{pad(ok)}</div>
          <div className="l">Ingested OK</div>
        </div>
        <div className="stat">
          <div className={`n${failed ? " crit" : ""}`}>{pad(failed)}</div>
          <div className="l">Failed</div>
        </div>
        <div className="stat">
          <div className="n amb">{pad(issues.length)}</div>
          <div className="l">Reported issues</div>
        </div>
        <div className="stat">
          <div className="n info">{pad(logs.length)}</div>
          <div className="l">Total processed</div>
        </div>
      </div>

      <div className="panelhead">
        <h3>Ingestion log</h3>
        <span className="mono">newest first</span>
      </div>
      <div className="tablewrap" style={{ marginBottom: 24 }}>
        <table className="pb">
          <thead>
            <tr>
              <th>Gmail message</th>
              <th>Status</th>
              <th>Error</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="mono">{log.gmailMessageId}</td>
                <td>
                  <span className={`stcell ${log.status === "SUCCESS" ? "ok" : "fail"}`}>
                    {log.status === "SUCCESS" ? "Success" : "Failed"}
                  </span>
                </td>
                <td className="mono" style={{ color: "var(--muted)", fontSize: ".76rem" }}>
                  {log.errorDetail ?? "—"}
                </td>
                <td>
                  {log.status === "FAILED" && (
                    <form action={retryOne.bind(null, log.gmailMessageId)}>
                      <button type="submit" className="btn">
                        Retry
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: "var(--muted)" }}>
                  No mail processed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panelhead">
        <h3>Reported issues</h3>
        <span className="mono">{issues.length} total</span>
      </div>
      {issues.length === 0 ? (
        <div className="empty">No reported issues. Student reports from the &ldquo;Report an issue&rdquo; page land here.</div>
      ) : (
        <div className="feed">
          {issues.map((i) => (
            <article key={i.id} className="note">
              <div className="nmeta">
                <span>{i.reporterEmail}</span>
                {i.company && (
                  <Link href={`/companies/${i.company.id}`} style={{ color: "var(--info)" }}>
                    {i.company.name}
                  </Link>
                )}
                <span style={{ marginLeft: "auto" }}>{i.createdAt.toLocaleString()}</span>
              </div>
              <p style={{ marginTop: 8 }}>{i.description}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
