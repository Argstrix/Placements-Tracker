import type { PrismaClient } from "@prisma/client";

export async function seedInitialAdmin(db: PrismaClient, email: string): Promise<void> {
  const normalized = email.toLowerCase();
  await db.adminUser.upsert({
    where: { email: normalized },
    update: {},
    create: { email: normalized },
  });
}
