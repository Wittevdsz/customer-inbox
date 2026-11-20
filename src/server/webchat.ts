import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts, conversations, messages, widgets } from "@/db/schema";
import { addInbound, openConversation } from "@/server/conversations";
import { sameText, sha256 } from "@/server/logic";
import { joinRoom } from "@/server/live";

// The public side of a chat widget. Every route needs the widget's key; a
// conversation's routes also need the visitor token handed out when it
// started, which is stored only as a hash. A visitor reads customer
// messages and replies, never notes, logged changes or who handled it.

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

export async function widgetByKey(key: string) {
  if (!/^[a-z0-9]{1,40}$/.test(key)) return null;
  const [widget] = await db.select().from(widgets).where(eq(widgets.publicKey, key));
  return widget ?? null;
}

export async function serveWidget(key: string) {
  const widget = await widgetByKey(key);
  if (!widget) return json({ error: "not_found" }, 404);
  return json({ name: widget.name, greeting: widget.greeting });
}

const startInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
    message: z.string().trim().min(1).max(4000),
  })
  .strict();

export async function serveStart(key: string, request: Request) {
  const widget = await widgetByKey(key);
  if (!widget) return json({ error: "not_found" }, 404);
  const parsed = startInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const now = Date.now();
  const contactId = crypto.randomUUID();
  await db.insert(contacts).values({
    id: contactId,
    name: parsed.data.name,
    email: parsed.data.email || null,
    createdAt: now,
  });
  const conversationId = await openConversation({
    contactId,
    channel: "webchat",
    widgetId: widget.id,
    defaultTeamId: widget.defaultTeamId,
    text: parsed.data.message,
    at: now,
    visitorTokenHash: await sha256(token),
  });
  return json({ conversationId, token });
}

/** The visitor's own conversation, or null when the key, id or token doesn't match. */
async function visitorConversation(key: string, conversationId: string | null, token: string | null) {
  if (!conversationId || !token || conversationId.length > 64 || token.length > 128) return null;
  const widget = await widgetByKey(key);
  if (!widget) return null;
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.widgetId, widget.id)));
  if (!conversation?.visitorTokenHash) return null;
  return sameText(conversation.visitorTokenHash, await sha256(token)) ? conversation : null;
}

function credentials(request: Request) {
  return {
    conversationId: request.headers.get("x-conversation-id"),
    token: request.headers.get("x-visitor-token"),
  };
}

export async function serveMessages(key: string, request: Request) {
  const { conversationId, token } = credentials(request);
  const conversation = await visitorConversation(key, conversationId, token);
  if (!conversation) return json({ error: "unauthorized" }, 401);
  if (request.method === "POST") {
    const parsed = z
      .object({ body: z.string().trim().min(1).max(4000) })
      .strict()
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: "invalid" }, 400);
    await addInbound(conversation.id, parsed.data.body, Date.now());
  }
  const thread = await db
    .select({ id: messages.id, kind: messages.kind, body: messages.body, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.conversationId, conversation.id), inArray(messages.kind, ["in", "out"])))
    .orderBy(asc(messages.createdAt), asc(messages.id));
  return json({
    messages: thread.map((m) => ({ id: m.id, fromVisitor: m.kind === "in", body: m.body, createdAt: m.createdAt })),
  });
}

/** The visitor's WebSocket: change pings for their own conversation only. */
export async function serveVisitorLive(key: string, request: Request) {
  const url = new URL(request.url);
  const conversation = await visitorConversation(key, url.searchParams.get("conversation"), url.searchParams.get("token"));
  if (!conversation) return new Response("Unauthorized", { status: 401 });
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket", { status: 426 });
  }
  return joinRoom(conversation.id, request);
}
