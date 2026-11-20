import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as conversations from "@/server/conversations";
import { contactSummary } from "@/server/contacts";
import { listPeople } from "@/server/people";
import { listLabels, listQuickReplies, listTeams } from "@/server/settings";
import { deliverWhatsApp, whatsappConfig } from "@/server/whatsapp";
import { viewerMiddleware } from "@/serverFunctions/middleware";

const NOT_FOUND = "Conversation not found";

/** The inbox list with what its filters offer. */
export const getInbox = createServerFn()
  .middleware([viewerMiddleware])
  .validator((data: unknown) => conversations.listInput.parse(data ?? {}))
  .handler(async ({ data, context: { viewer } }) => {
    const [rows, teams, labels] = await Promise.all([
      conversations.listConversations(viewer, data),
      listTeams(),
      listLabels(),
    ]);
    return {
      rows,
      teams: teams.map((t) => ({ id: t.id, name: t.name })),
      labels,
      whatsapp: whatsappConfig() !== null,
    };
  });

/** One conversation with its thread, contact and what the side panel offers, or null when hidden. */
export const getConversation = createServerFn()
  .middleware([viewerMiddleware])
  .validator((data: unknown) => conversations.idInput.parse(data))
  .handler(async ({ data, context: { viewer } }) => {
    const thread = await conversations.getThread(viewer, data.id);
    if (!thread) return null;
    const [contact, teams, people, quickReplies] = await Promise.all([
      contactSummary(thread.conversation.contactId),
      listTeams(),
      listPeople(),
      listQuickReplies(viewer),
    ]);
    return {
      ...thread,
      contact,
      teams: teams.map((t) => ({ id: t.id, name: t.name })),
      people,
      quickReplies,
    };
  });

export const sendReply = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => conversations.bodyInput.parse(data))
  .handler(async ({ data, context: { viewer } }) => {
    const result = await conversations.addReply(viewer, data.id, data.body);
    if (!result) throw new Error(NOT_FOUND);
    if (result.conversation.channel === "whatsapp") {
      const [contact] = await db
        .select({ waId: contacts.waId })
        .from(contacts)
        .where(eq(contacts.id, result.conversation.contactId));
      waitUntil(deliverWhatsApp(result.message.id, contact?.waId ?? null, data.body));
    }
    return { ok: true };
  });

export const addNote = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => conversations.bodyInput.parse(data))
  .handler(async ({ data, context: { viewer } }) => {
    if (!(await conversations.addNote(viewer, data.id, data.body))) throw new Error(NOT_FOUND);
    return { ok: true };
  });

export const setStatus = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => conversations.statusInput.parse(data))
  .handler(async ({ data, context: { viewer } }) => {
    if (!(await conversations.setStatus(viewer, data.id, data.status))) throw new Error(NOT_FOUND);
    return { ok: true };
  });

export const assignConversation = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => conversations.assignInput.parse(data))
  .handler(async ({ data, context: { viewer } }) => {
    if (!(await conversations.assign(viewer, data))) throw new Error(NOT_FOUND);
    return { ok: true };
  });
