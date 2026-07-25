import { prisma } from "@/db/client";
import { getRetentionOverview } from "@/queries/getRetentionOverview";
import { retireCompany, unretireCompany } from "../actions";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RetentionPage() {
  const session = await getServerSession(buildAuthOptions());
  const role = session?.user?.email ? (await isAuthorized(session.user.email, prisma)).role : null;
  if (role !== "admin") notFound();

  const { companies, liveAttachments, purgedAttachments, retiredCount } = await getRetentionOverview(prisma);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="view">
      <div className="phead">
        <p className="eye">Admin</p>
        <h1>Storage retention</h1>
        <p>
          Once a drive is over and its final shortlist is out, the company retires and its attachments are deleted from
          blob storage on the next nightly sweep. Company records, mail history, original mail text and shortlist data
          are never deleted.
        </p>
      </div>

      <div className="stats" style={{ marginBottom: 22 }}>
        <div className="stat">
          <div className="n info">{pad(retiredCount)}</div>
          <div className="l">Retired companies</div>
        </div>
        <div className="stat">
          <div className="n sig">{pad(purgedAttachments)}</div>
          <div className="l">Files reclaimed</div>
        </div>
        <div className="stat">
          <div className="n amb">{pad(liveAttachments)}</div>
          <div className="l">Files still stored</div>
        </div>
      </div>

      <div className="panelhead">
        <h3>Companies</h3>
        <span className="mono">retired first</span>
      </div>
      <div className="tablewrap">
        <table className="pb">
          <thead>
            <tr>
              <th>Company</th>
              <th>Mails</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/companies/${c.id}`} style={{ color: "var(--info)" }}>
                    {c.name}
                  </Link>
                </td>
                <td className="mono">{c._count.mailEvents}</td>
                <td>
                  {!c.retiredAt && <span className="stcell ok">Active</span>}
                  {c.retiredAt && !c.purgedAt && <span className="stcell">Retired — purge pending</span>}
                  {c.retiredAt && c.purgedAt && <span className="stcell">Retired — files reclaimed</span>}
                </td>
                <td>
                  {c.retiredAt ? (
                    <form action={unretireCompany.bind(null, c.id)}>
                      <button
                        type="submit"
                        className="btn"
                        // Un-retiring stops future purging, but files already
                        // deleted cannot come back — say so before the click.
                        title="Returns this company to the live pool. Files already deleted cannot be restored."
                      >
                        Un-retire
                      </button>
                    </form>
                  ) : (
                    <form action={retireCompany.bind(null, c.id)}>
                      <button type="submit" className="btn" title="Marks the drive finished. Files are deleted on the next nightly sweep.">
                        Retire
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: "var(--muted)" }}>
                  No companies yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
