export const CHANNEL_LABELS: Record<string, string> = { webchat: "Webchat", whatsapp: "WhatsApp" };

/** "14:05" today, "Mon 14:05" this week, else "3 Mar". */
export function shortTime(ms: number): string {
  const date = new Date(ms);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  if (now.getTime() - ms < 6 * 24 * 60 * 60 * 1000) {
    return date.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    try {
      const parsed = JSON.parse(cause.message) as { message?: string }[];
      if (Array.isArray(parsed) && parsed[0]?.message) return parsed[0].message;
    } catch {
      // Not a validation list.
    }
    return cause.message;
  }
  return "That didn't work. Try again.";
}
