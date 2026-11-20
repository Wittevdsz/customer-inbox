import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, messages } from "@/db/schema";
import { addInbound, openConversation, setDelivery } from "@/server/conversations";
import { parseWhatsApp, sameText, validSignature } from "@/server/logic";
import { getSetting } from "@/server/settings";

const GRAPH_API = "https://graph.facebook.com/v21.0";
const MAX_BODY_BYTES = 256 * 1024;

interface WhatsAppConfig {
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  phoneNumberId: string;
}

function read(name: string): string {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" ? value.trim() : "";
}

/** The optional feature's values, or null while any is missing. */
export function whatsappConfig(): WhatsAppConfig | null {
  const config = {
    accessToken: read("WHATSAPP_ACCESS_TOKEN"),
    appSecret: read("WHATSAPP_APP_SECRET"),
    verifyToken: read("WHATSAPP_VERIFY_TOKEN"),
    phoneNumberId: read("WHATSAPP_PHONE_NUMBER_ID"),
  };
  return Object.values(config).every(Boolean) ? config : null;
}

/** GET: Meta's subscription check. POST: inbound messages, signed with the app secret. */
export async function serveWhatsAppHook(request: Request): Promise<Response> {
  const config = whatsappConfig();
  if (!config) return new Response("Not found", { status: 404 });
  if (request.method === "GET") {
    const url = new URL(request.url);
    const token = url.searchParams.get("hub.verify_token") ?? "";
    if (url.searchParams.get("hub.mode") !== "subscribe" || !sameText(token, config.verifyToken)) {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response(url.searchParams.get("hub.challenge") ?? "", { headers: { "content-type": "text/plain" } });
  }
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return new Response("Too large", { status: 413 });
  if (!(await validSignature(config.appSecret, body, request.headers.get("x-hub-signature-256")))) {
    return new Response("Unauthorized", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  for (const inbound of parseWhatsApp(payload)) await receive(inbound);
  return new Response("ok");
}

async function receive(inbound: ReturnType<typeof parseWhatsApp>[number]) {
  const [seen] = await db.select({ id: messages.id }).from(messages).where(eq(messages.externalId, inbound.externalId));
  if (seen) return;
  let [contact] = await db.select().from(contacts).where(eq(contacts.waId, inbound.waId));
  if (!contact) {
    [contact] = await db
      .insert(contacts)
      .values({ id: crypto.randomUUID(), name: inbound.name, waId: inbound.waId, phone: `+${inbound.waId}`, createdAt: inbound.at })
      .returning();
  }
  const [latest] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.contactId, contact!.id), eq(conversations.channel, "whatsapp")))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  if (latest) {
    await addInbound(latest.id, inbound.text, inbound.at, inbound.externalId);
    return;
  }
  await openConversation({
    contactId: contact!.id,
    channel: "whatsapp",
    defaultTeamId: await getSetting("whatsappTeamId"),
    text: inbound.text,
    at: inbound.at,
    externalId: inbound.externalId,
  });
}

/** Sends a reply to the customer's WhatsApp and records whether it went. */
export async function deliverWhatsApp(messageId: string, waId: string | null, text: string): Promise<void> {
  const config = whatsappConfig();
  let ok = false;
  if (config && waId) {
    try {
      const response = await fetch(`${GRAPH_API}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: waId, type: "text", text: { body: text } }),
        signal: AbortSignal.timeout(10_000),
      });
      ok = response.ok;
      if (!ok) console.error("WhatsApp send refused", response.status);
    } catch (error) {
      console.error("WhatsApp send failed", error);
    }
  }
  await setDelivery(messageId, ok ? "sent" : "failed");
}
