import { prisma } from "@/db/client";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
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
        <div className="empty">Sign in with your VIT account to track companies and check your shortlist status.</div>
      </div>
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { interests: { include: { company: true } } },
  });

  return (
    <div className="view">
      <div className="phead">
        <p className="eye">Your week</p>
        <h1>Dashboard</h1>
        <p>Keep the companies you care about in one place, and check your shortlist status any time.</p>
      </div>

      <div className="callout" style={{ marginBottom: 18 }}>
        <span className="ci">✓</span>
        <div>
          Wondering if you got shortlisted? <Link href="/search" style={{ color: "var(--info)", fontWeight: 600 }}>Check your Neo ID</Link>.
          It&rsquo;s entered fresh each session and <b>never saved</b> — so it&rsquo;s not shown here, by design.
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
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

      {user && (
        <div style={{ paddingTop: 4 }}>
          <DeleteMyDataButton />
        </div>
      )}
    </div>
  );
}
