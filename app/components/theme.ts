export type Theme = "light" | "dark";

export const THEME_KEY = "pb-theme";

/**
 * Same-tab notification channel. The `storage` event only fires in *other*
 * tabs, so a toggle has to announce itself for this tab to re-read the value.
 */
export const THEME_EVENT = "pb-theme-change";

export function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * The theme actually in effect. An explicit choice (mirrored onto the
 * `data-theme` attribute) wins; otherwise fall back to the OS preference,
 * which is what the stylesheet does when no attribute is present.
 */
export function resolveTheme(attribute: string | null, prefersDark: boolean): Theme {
  if (isTheme(attribute)) return attribute;
  return prefersDark ? "dark" : "light";
}

export function nextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}

/**
 * Applies the saved theme before the first paint.
 *
 * Inlined into <head> so it runs ahead of rendering — restoring the theme after
 * hydration instead meant every reload flashed the light theme at anyone who
 * had chosen dark. Wrapped in try/catch because localStorage throws outright in
 * some privacy modes, and a failure here must not take the page down.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;
