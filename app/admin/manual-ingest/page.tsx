import { prisma } from "@/db/client";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { isAuthorized } from "@/auth/isAuthorized";
import { notFound } from "next/navigation";
import ManualIngestForm from "./ManualIngestForm";

export const dynamic = "force-dynamic";

export default async function ManualIngestPage() {
  const session = await getServerSession(buildAuthOptions());
  const role = session?.user?.email ? (await isAuthorized(session.user.email, prisma)).role : null;
  if (role !== "admin") notFound();

  return (
    <div className="view">
      <div className="phead">
        <p className="eye">Admin · manual</p>
        <h1>Manual ingest</h1>
        <p>
          Upload a raw <span className="mono">.eml</span> to run it through the exact pipeline the webhook uses — handy
          for testing extraction on a real mail before it goes live.
        </p>
      </div>
      <ManualIngestForm />
    </div>
  );
}
