"use server";
import { prisma } from "@/db/client";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";
import { revalidatePath } from "next/cache";
import { encryptNeoId } from "./neoIdVault";

/** Saves the user's own Neo ID, encrypted, and marks the save prompt
 * answered. Only called when the user explicitly clicks "Save it". */
export async function saveNeoId(neoId: string): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");
  await prisma.user.upsert({
    where: { email: session.user.email },
    update: { neoIdEncrypted: encryptNeoId(neoId), neoIdPromptDismissedAt: new Date() },
    create: {
      email: session.user.email,
      neoIdEncrypted: encryptNeoId(neoId),
      neoIdPromptDismissedAt: new Date(),
    },
  });
  revalidatePath("/search");
}

/** Marks the save prompt answered "no" — nothing is stored, and the user
 * is not asked again. */
export async function dismissNeoIdPrompt(): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");
  await prisma.user.upsert({
    where: { email: session.user.email },
    update: { neoIdPromptDismissedAt: new Date() },
    create: { email: session.user.email, neoIdPromptDismissedAt: new Date() },
  });
  revalidatePath("/search");
}

/** Clears a previously saved Neo ID. Leaves neoIdPromptDismissedAt as-is,
 * so forgetting it doesn't immediately re-trigger the save prompt. */
export async function forgetNeoId(): Promise<void> {
  const session = await getServerSession(buildAuthOptions());
  if (!session?.user?.email) throw new Error("Not authorized");
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return;
  await prisma.user.update({ where: { id: user.id }, data: { neoIdEncrypted: null } });
  revalidatePath("/dashboard");
}
