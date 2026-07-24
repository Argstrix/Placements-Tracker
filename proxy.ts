import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

// Guards pages only — a browser redirect to sign-in is the right UX there.
// API routes (/api/attachments/*, /api/ingest/manual) are deliberately not
// matched here: they already perform their own session/role checks and
// return proper JSON 401/403 responses, which a redirect would break for
// any programmatic caller (including our own client-side fetch calls).
export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const signInUrl = new URL("/api/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/companies/:path*",
    "/announcements/:path*",
    "/search/:path*",
    "/report-issue/:path*",
  ],
};
