import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { prisma } from "@/db/client";
import { decryptNeoId } from "@/auth/neoIdVault";
import ShortlistChecker from "./ShortlistChecker";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const session = await getServerSession(buildAuthOptions());
  let savedState: "none" | "asked" | "saved" = "none";
  let savedNeoId: string | undefined;

  if (session?.user?.email) {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (user?.neoIdEncrypted) {
      savedState = "saved";
      savedNeoId = decryptNeoId(user.neoIdEncrypted);
    } else if (user?.neoIdPromptDismissedAt) {
      savedState = "asked";
    }
  }

  return (
    <div className="view">
      <div className="phead">
        <p className="eye">Shortlist lookup</p>
        <h1>Check shortlist</h1>
        <p>
          See which companies shortlisted you. Matching uses one-way fingerprints of the IDs in shortlist mail, so
          the check itself never stores a Neo ID.
        </p>
      </div>

      <ShortlistChecker savedState={savedState} savedNeoId={savedNeoId} />

      <div className="callout" style={{ marginTop: 16 }}>
        <span className="ci">i</span>
        <div>
          Neo IDs used to check shortlists are matched against one-way fingerprints and never stored — exact ID
          only, partial matches aren&rsquo;t possible. You can optionally save your own Neo ID to your account,
          encrypted, so it&rsquo;s pre-filled next time; forget it any time from your dashboard.
        </div>
      </div>
    </div>
  );
}
