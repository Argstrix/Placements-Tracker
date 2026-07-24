// Shared mapping from a MailEvent type to its visual treatment, so the
// timeline stations, mail cards, and tags stay consistent everywhere.
export function mailMeta(type: string): { cls: string; label: string; result: boolean } {
  switch (type) {
    case "REGISTRATION":
      return { cls: "reg", label: "Registration", result: false };
    case "SHORTLIST_ROUND":
      return { cls: "short", label: "Shortlist", result: false };
    case "RESULT":
      return { cls: "res", label: "Result", result: true };
    case "UPDATE":
      return { cls: "upd", label: "Update", result: false };
    case "GENERAL_NOTICE":
      return { cls: "note", label: "Notice", result: false };
    default:
      return { cls: "note", label: type.replace(/_/g, " "), result: false };
  }
}

export function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
