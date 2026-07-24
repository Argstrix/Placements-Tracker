import NextAuth from "next-auth";
import { buildAuthOptions } from "@/auth/authOptions";

const handler = NextAuth(buildAuthOptions());
export { handler as GET, handler as POST };
