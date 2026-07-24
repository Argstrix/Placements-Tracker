"use server";
import { prisma } from "@/db/client";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { revalidatePath } from "next/cache";

export async function setNeoId(formData: FormData): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");
  const neoId = String(formData.get("neoId")).toUpperCase();
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
