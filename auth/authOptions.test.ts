import { describe, it, expect, vi } from "vitest";

vi.mock("@/env", () => ({
  getEnv: vi.fn().mockReturnValue({
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    NEXTAUTH_SECRET: "secret",
    INITIAL_ADMIN_EMAIL: "gargstrixy@gmail.com",
  }),
}));
vi.mock("@/db/client", () => ({ prisma: {} }));

const mockSeedInitialAdmin = vi.fn();
vi.mock("@/admin/seedInitialAdmin", () => ({ seedInitialAdmin: (...args: unknown[]) => mockSeedInitialAdmin(...args) }));

const mockIsAuthorized = vi.fn();
vi.mock("./isAuthorized", () => ({ isAuthorized: (...args: unknown[]) => mockIsAuthorized(...args) }));

describe("authOptions signIn callback", () => {
  it("seeds the initial admin (from env) before checking authorization", async () => {
    mockIsAuthorized.mockResolvedValue({ allowed: true, role: "admin" });
    const { buildAuthOptions } = await import("./authOptions");
    const options = buildAuthOptions();
    const signIn = options.callbacks!.signIn!;

    const callOrder: string[] = [];
    mockSeedInitialAdmin.mockImplementation(async () => {
      callOrder.push("seed");
    });
    mockIsAuthorized.mockImplementation(async () => {
      callOrder.push("check");
      return { allowed: true, role: "admin" };
    });

    // @ts-expect-error - minimal shape for the callback under test
    await signIn({ user: { email: "gargstrixy@gmail.com" } });

    expect(mockSeedInitialAdmin).toHaveBeenCalledWith(expect.anything(), "gargstrixy@gmail.com");
    expect(callOrder).toEqual(["seed", "check"]);
  });

  it("rejects sign-in without an email, without seeding", async () => {
    const { buildAuthOptions } = await import("./authOptions");
    const options = buildAuthOptions();
    const signIn = options.callbacks!.signIn!;
    mockSeedInitialAdmin.mockClear();

    // @ts-expect-error - minimal shape for the callback under test
    const result = await signIn({ user: {} });
    expect(result).toBe(false);
    expect(mockSeedInitialAdmin).not.toHaveBeenCalled();
  });
});
