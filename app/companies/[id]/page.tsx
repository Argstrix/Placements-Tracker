import { prisma } from "@/db/client";
import { getCompanyTimeline } from "@/queries/getCompanyTimeline";
import MailEventCard from "../../components/MailEventCard";
import InterestTracker from "./InterestTracker";
import { mailMeta, shortDate } from "../../components/mailMeta";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompanyTimeline(prisma, id);
  if (!company) notFound();

  const session = await getServerSession(buildAuthOptions());
  const existingInterest = session?.user?.email
    ? await prisma.interest.findFirst({
        where: { companyId: id, user: { email: session.user.email } },
      })
    : null;

  // The journey, oldest → newest, built straight from the recorded mail.
  const stations = [...company.mailEvents].sort(
    (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()
  );

  return (
    <div className="view">
      <Link href="/companies" className="btn" style={{ marginBottom: 14 }}>
        ← All companies
      </Link>

      <div className="phead">
        <p className="eye">{company.category ?? "Company"}</p>
        <h1>{company.name}</h1>
        {company.eligibleBranches.length > 0 && (
          <p>Eligible: {company.eligibleBranches.join(", ")}</p>
        )}
      </div>

      {session && (
        <div style={{ marginBottom: 18 }}>
          <InterestTracker companyId={company.id} initialStatus={existingInterest?.status ?? null} />
        </div>
      )}

      <div className="stats" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="n sig">{company.ctc ?? "—"}</div>
          <div className="l">CTC</div>
        </div>
        <div className="stat">
          <div className="n">{company.stipend ?? "—"}</div>
          <div className="l">Stipend</div>
        </div>
        <div className="stat">
          <div className="n info">{company.eligibleBranches.length || "—"}</div>
          <div className="l">Branches</div>
        </div>
        <div className="stat">
          <div className="n">{company.mailEvents.length}</div>
          <div className="l">Mails on record</div>
        </div>
      </div>

      {company.eligibilityCriteria && (
        <div className="callout" style={{ marginBottom: 18 }}>
          <span className="ci">i</span>
          <div>
            <b>Eligibility:</b> {company.eligibilityCriteria}
          </div>
        </div>
      )}

      {stations.length > 0 && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panelhead">
            <h3>The journey</h3>
            <span className="mono">{stations.length} events</span>
          </div>
          <div className="line">
            {stations.map((ev, i) => {
              const meta = mailMeta(ev.type);
              const last = i === stations.length - 1;
              return (
                <div key={ev.id} className={`stnt done${meta.result ? " result" : ""}${last ? " next" : ""}`}>
                  <span className="node" />
                  <div className="st">{meta.label}</div>
                  <div className="dt">{shortDate(ev.receivedAt)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {company.enrichmentSummary && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panelhead">
            <h3>Company overview</h3>
            <span className="mono">auto-generated · unofficial</span>
          </div>
          <p style={{ margin: 0, fontSize: ".9rem" }}>{company.enrichmentSummary}</p>
          {company.enrichmentSources.length > 0 && (
            <p className="mono" style={{ marginTop: 10, fontSize: ".72rem", color: "var(--muted)" }}>
              Sources:{" "}
              {company.enrichmentSources.map((s, i) => (
                <a key={s} href={s} target="_blank" rel="noreferrer" style={{ color: "var(--info)", marginRight: 8 }}>
                  [{i + 1}]
                </a>
              ))}
            </p>
          )}
        </div>
      )}

      <div className="panelhead">
        <h3>Mail history</h3>
        <span className="mono">{company.mailEvents.length} mails</span>
      </div>
      <div className="mails">
        {company.mailEvents.map((event) => (
          <MailEventCard key={event.id} event={event} />
        ))}
      </div>

      <div className="callout" style={{ marginTop: 16 }}>
        <span className="ci">i</span>
        <div>
          Spotted something wrong — a date, CTC, or eligibility that doesn&rsquo;t match the mail?{" "}
          <Link href={`/report-issue?companyId=${company.id}`} style={{ color: "var(--info)", fontWeight: 600 }}>
            Report it
          </Link>{" "}
          and an admin will re-check the extraction.
        </div>
      </div>
    </div>
  );
}
