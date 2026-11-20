// Pure rules shared by the server code, kept free of bindings so they can be unit-tested.

export interface Rule {
  id: string;
  keyword: string;
  teamId: string | null;
  assigneeId: string | null;
  labelId: string | null;
  position: number;
}

/** The first rule, by position, whose keyword the message contains (ignoring case). */
export function matchRule<T extends Rule>(rules: T[], message: string): T | null {
  const text = message.toLocaleLowerCase();
  const ordered = [...rules].sort((a, b) => a.position - b.position);
  return (
    ordered.find((rule) => {
      const keyword = rule.keyword.trim().toLocaleLowerCase();
      return keyword !== "" && text.includes(keyword);
    }) ?? null
  );
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** "4m 05s", "2h 10m", "35s" */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
}

/** Whether a member may see a conversation: admins all, agents their teams', team-less and their own. */
export function canSee(
  viewer: { id: string; admin: boolean; teamIds: string[] },
  conversation: { teamId: string | null; assigneeId: string | null },
): boolean {
  return (
    viewer.admin ||
    conversation.teamId === null ||
    conversation.assigneeId === viewer.id ||
    viewer.teamIds.includes(conversation.teamId)
  );
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export async function hmacSha256(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

/** Compares in time independent of where the strings differ. */
export function sameText(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

/** Checks Meta's X-Hub-Signature-256 header against the raw body. */
export async function validSignature(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  return sameText(header.slice("sha256=".length), await hmacSha256(secret, body));
}

export interface InboundWhatsApp {
  waId: string;
  name: string;
  text: string;
  externalId: string;
  at: number;
}

/** The text messages in a WhatsApp Cloud API webhook payload. Other message types arrive as a placeholder. */
export function parseWhatsApp(payload: unknown): InboundWhatsApp[] {
  const found: InboundWhatsApp[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return found;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      const msgs = value?.messages;
      if (!Array.isArray(msgs)) continue;
      const profiles = Array.isArray(value?.contacts) ? (value.contacts as { wa_id?: string; profile?: { name?: string } }[]) : [];
      for (const raw of msgs as Record<string, unknown>[]) {
        const from = typeof raw.from === "string" ? raw.from : "";
        const id = typeof raw.id === "string" ? raw.id : "";
        if (!from || !id) continue;
        const text =
          raw.type === "text" && typeof (raw.text as { body?: unknown })?.body === "string"
            ? (raw.text as { body: string }).body
            : `[${typeof raw.type === "string" ? raw.type : "message"}]`;
        const name = profiles.find((p) => p.wa_id === from)?.profile?.name ?? "";
        const seconds = Number(raw.timestamp);
        found.push({
          waId: from,
          name: name || `+${from}`,
          text,
          externalId: id,
          at: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now(),
        });
      }
    }
  }
  return found;
}

/** UTC days from start to end, as YYYY-MM-DD. */
export function daysBetween(start: number, end: number): string[] {
  const days: string[] = [];
  const day = new Date(start);
  day.setUTCHours(0, 0, 0, 0);
  while (day.getTime() <= end) {
    days.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return days;
}
