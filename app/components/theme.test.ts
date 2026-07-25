import { describe, it, expect } from "vitest";
import { isTheme, nextTheme, resolveTheme, THEME_BOOT_SCRIPT, THEME_KEY } from "./theme";

describe("resolveTheme", () => {
  it("uses an explicit choice over the OS preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("falls back to the OS preference when nothing has been chosen", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("ignores a junk attribute value rather than trusting it", () => {
    // The attribute is world-writable via devtools or a stale localStorage
    // entry; anything unrecognized must not become the rendered theme.
    expect(resolveTheme("solarized", true)).toBe("dark");
    expect(resolveTheme("", false)).toBe("light");
  });
});

describe("nextTheme", () => {
  it("flips between the two themes", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });
});

describe("isTheme", () => {
  it("accepts only the two known values", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("Dark")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});

describe("THEME_BOOT_SCRIPT", () => {
  it("reads the same storage key the toggle writes", () => {
    expect(THEME_BOOT_SCRIPT).toContain(JSON.stringify(THEME_KEY));
  });

  it("survives a localStorage access that throws", () => {
    // Private-browsing modes throw on access; the script must not break the page.
    const run = new Function("localStorage", "document", THEME_BOOT_SCRIPT);
    const throwing = {
      getItem() {
        throw new Error("access denied");
      },
    };
    expect(() => run(throwing, { documentElement: { setAttribute: () => {} } })).not.toThrow();
  });

  it("applies a stored theme to the document element", () => {
    const run = new Function("localStorage", "document", THEME_BOOT_SCRIPT);
    const applied: Record<string, string> = {};
    run(
      { getItem: () => "dark" },
      { documentElement: { setAttribute: (k: string, v: string) => void (applied[k] = v) } }
    );
    expect(applied["data-theme"]).toBe("dark");
  });

  it("ignores a junk stored value instead of applying it", () => {
    const run = new Function("localStorage", "document", THEME_BOOT_SCRIPT);
    const applied: Record<string, string> = {};
    run(
      { getItem: () => "neon" },
      { documentElement: { setAttribute: (k: string, v: string) => void (applied[k] = v) } }
    );
    expect(applied).toEqual({});
  });
});
