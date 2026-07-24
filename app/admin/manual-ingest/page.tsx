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
    <main className="max-w-xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Manual Ingest (.eml)</h1>
      <ManualIngestForm />
    </main>
  );
}
