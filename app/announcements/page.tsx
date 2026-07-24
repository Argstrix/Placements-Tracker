import { prisma } from "@/db/client";
import { getGeneralNotices } from "@/queries/getGeneralNotices";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const notices = await getGeneralNotices(prisma);
  return (
    <div className="view">
      <div className="phead">
        <p className="eye">General notices</p>
        <h1>Announcements</h1>
        <p>Placement-cell mail that isn&rsquo;t tied to a single company — deadlines, reminders, and pre-placement talks.</p>
      </div>

      {notices.length === 0 ? (
        <div className="empty">No announcements yet. General notices from the placement cell will show up here.</div>
      ) : (
        <div className="feed">
          {notices.map((n) => (
            <article key={n.id} className="note">
              <div className="nmeta">
                <span className="tag note">Notice</span>
                <span>from {n.sender}</span>
                <span style={{ marginLeft: "auto" }}>{n.receivedAt.toLocaleString()}</span>
              </div>
              <h4>{n.subject}</h4>
              <p style={{ whiteSpace: "pre-wrap" }}>{n.bodyText}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
