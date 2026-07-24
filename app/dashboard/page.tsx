import { prisma } from "@/db/client";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { setNeoId } from "./actions";
import DeleteMyDataButton from "./DeleteMyDataButton";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) {
    return (
      <div className="view">
        <div className="phead">
          <p className="eye">Dashboard</p>
          <h1>Sign in to see your dashboard</h1>
        </div>
        <div className="empty">
          Sign in with your VIT account to save your Neo ID, track companies, and get shortlist alerts.
        </div>
      </div>
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { interests: { include: { company: true } } },
  });

  const shortlistedFor = user?.neoId
    ? await prisma.shortlistEntry.findMany({
        where: { neoId: user.neoId },
        include: { mailEvent: { include: { company: true } } },
      })
    : [];

  return (
    <div className="view">
      <div className="phead">
        <p className="eye">Your week</p>
        <h1>Dashboard</h1>
        <p>Save your Neo ID for automatic shortlist alerts, and keep the companies you care about in one place.</p>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <h3>Your Neo ID</h3>
        <p className="psub">Saved only to match you against incoming shortlists. You can clear it any time below.</p>
        <form action={setNeoId} className="formrow">
          <input
            name="neoId"
            defaultValue={user?.neoId ?? ""}
            placeholder="O3D8V4U8"
            className="mono"
            aria-label="Your Neo ID"
            style={{
              flex: 1,
              minWidth: 180,
              padding: "10px 12px",
              borderRadius: 9,
              border: "1px solid var(--hair)",
              background: "var(--card-2)",
              color: "var(--ink)",
              letterSpacing: ".1em",
              textTransform: "uppercase",
            }}
          />
          <button type="submit" className="btn pri">
            Save Neo ID
          </button>
        </form>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panelhead">
            <h3>You&rsquo;re shortlisted</h3>
            {user?.neoId && <span className="mono">{user.neoId}</span>}
          </div>
          {shortlistedFor.length > 0 ? (
            <div className="results">
              {shortlistedFor.map(
                (s) =>
                  s.mailEvent.company && (
                    <Link key={s.id} href={`/companies/${s.mailEvent.company.id}`} className="res">
                      <span className="tick" aria-hidden="true">
                        ✓
                      </span>
                      <div>
                        <b>{s.mailEvent.company.name}</b>
                        <small>on the shortlist</small>
                      </div>
                    </Link>
                  )
              )}
            </div>
          ) : (
            <div className="empty">
              {user?.neoId
                ? "You’re not on any shortlist yet. New ones land through the season."
                : "Save your Neo ID above to see shortlists you’re on."}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panelhead">
            <h3>Tracking</h3>
            <span className="mono">{user?.interests.length ?? 0}</span>
          </div>
          {user && user.interests.length > 0 ? (
            <div className="colist">
              {user.interests.map((i) => (
                <Link key={i.id} href={`/companies/${i.companyId}`} className="corow">
                  <span className="cc">{i.company.name.slice(0, 3).toUpperCase()}</span>
                  <span className="cn">
                    <b>{i.company.name}</b>
                  </span>
                  <span className="cmeta">
                    <span className="tag note">{i.status}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty">Open any company and set &ldquo;Track my interest&rdquo; to pin it here.</div>
          )}
        </div>
      </div>

      {user && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--hair)" }}>
          <DeleteMyDataButton />
        </div>
      )}
    </div>
  );
}
