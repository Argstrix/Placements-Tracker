import { prisma } from "@/db/client";
import { getGeneralNotices } from "@/queries/getGeneralNotices";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const notices = await getGeneralNotices(prisma);
  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Announcements</h1>
      {notices.map((n) => (
        <div key={n.id} className="border rounded p-4">
          <div className="text-sm text-gray-500">{n.receivedAt.toLocaleString()}</div>
          <div className="font-medium">{n.subject}</div>
          <p className="text-sm mt-2 whitespace-pre-wrap">{n.bodyText}</p>
        </div>
      ))}
      {notices.length === 0 && <p className="text-gray-500 text-sm">No announcements yet.</p>}
    </main>
  );
}
