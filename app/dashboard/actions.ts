"use server";
import { prisma } from "@/db/client";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { revalidatePath } from "next/cache";

export async function setNeoId(formData: FormData): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");
  // Entirely optional — an empty/missing submission clears it rather than
  // saving a stray "null" or "" string. Nothing in the app requires a Neo
  // ID to be set for any other feature to work.
  const raw = formData.get("neoId");
  const trimmed = raw ? String(raw).trim().toUpperCase() : "";
  const neoId = trimmed.length > 0 ? trimmed : null;
  await prisma.user.upsert({
    where: { email: session.user.email },
    update: { neoId },
    create: { email: session.user.email, neoId },
  });
  revalidatePath("/dashboard");
}

export async function setInterest(companyId: string, status: string): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");
  const user = await prisma.user.upsert({
    where: { email: session.user.email },
    update: {},
    create: { email: session.user.email },
  });
  await prisma.interest.upsert({
    where: { userId_companyId: { userId: user.id, companyId } },
    update: { status },
    create: { userId: user.id, companyId, status },
  });
  revalidatePath("/dashboard");
}

/** Self-service data erasure: removes this account's Neo ID and every
 * tracked-interest record. Scoped to the user's own personalization data —
 * reported issues aren't touched, since those are support records the
 * admin may still need to act on, akin to a support ticket. A no-op if the
 * user never saved a Neo ID or tracked any interest in the first place. */
export async function deleteMyData(): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return;

  await prisma.interest.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  revalidatePath("/dashboard");
}
