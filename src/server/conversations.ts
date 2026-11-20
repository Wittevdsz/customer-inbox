import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  contactLabels,
  contacts,
  conversations,
  messages,
  routingRules,
  teams,
  users,
} from "@/db/schema";
import { matchRule, preview } from "@/server/logic";
import { notifyChange } from "@/server/live";
import { nameMap } from "@/server/people";
import type { Viewer } from "@/server/viewer";

export const CHANNELS = ["webchat", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];

/** Which conversations a member may see: admins all, agents their teams', team-less and their own. */
export function visibleTo(viewer: Viewer): SQL | undefined {
  if (viewer.admin) return undefined;
  return or(
    isNull(conversations.teamId),
    eq(conversations.assigneeId, viewer.id),
    viewer.teamIds.length ? inArray(conversations.teamId, viewer.teamIds) : undefined,
  );
}

export const listInput = z
  .object({
    view: z.enum(["all", "mine", "unassigned"]).default("all"),
    status: z.enum(["open", "closed"]).optional(),
    teamId: z.string().max(64).optional(),
    labelId: z.string().max(64).optional(),
    channel: z.enum(CHANNELS).optional(),
  })
  .strict();

export async function listConversations(viewer: Viewer, filters: z.infer<typeof listInput>) {
  const where = and(
    visibleTo(viewer),
    filters.view === "mine" ? eq(conversations.assigneeId, viewer.id) : undefined,
    filters.view === "unassigned" ? isNull(conversations.assigneeId) : undefined,
    filters.status ? eq(conversations.status, filters.status) : undefined,
    filters.teamId ? eq(conversations.teamId, filters.teamId) : undefined,
    filters.channel ? eq(conversations.channel, filters.channel) : undefined,
    filters.labelId
      ? sql`exists (select 1 from ${contactLabels} where ${contactLabels.contactId} = ${conversations.contactId} and ${contactLabels.labelId} = ${filters.labelId})`
      : undefined,
  );
  const rows = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      preview: conversations.lastMessagePreview,
      contactName: contacts.name,
      teamName: teams.name,
      assigneeId: conversations.assigneeId,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .leftJoin(teams, eq(teams.id, conversations.teamId))
    .where(where)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);
  const names = await nameMap();
  return rows.map(({ assigneeId, ...row }) => ({
    ...row,
    assignee: assigneeId ? (names.get(assigneeId) ?? "Someone") : null,
  }));
}

/** The conversation when the viewer may see it, else null. */
export async function findVisible(viewer: Viewer, id: string) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), visibleTo(viewer)));
  return row ?? null;
}

export async function getThread(viewer: Viewer, id: string) {
  const conversation = await findVisible(viewer, id);
  if (!conversation) return null;
  const [thread, names] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt), asc(messages.id)),
    nameMap(),
  ]);
  return {
    conversation: {
      id: conversation.id,
      channel: conversation.channel as Channel,
      status: conversation.status,
      teamId: conversation.teamId,
      assigneeId: conversation.assigneeId,
      contactId: conversation.contactId,
      createdAt: conversation.createdAt,
    },
    messages: thread.map((m) => ({
      id: m.id,
      kind: m.kind as "in" | "out" | "note" | "event",
      body: m.body,
      delivery: m.delivery,
      createdAt: m.createdAt,
      author: m.authorUserId ? (names.get(m.authorUserId) ?? "Someone") : null,
    })),
  };
}

export const idInput = z.object({ id: z.string().min(1).max(64) }).strict();
export const bodyInput = z
  .object({ id: z.string().min(1).max(64), body: z.string().trim().min(1, "Write a message first").max(4000) })
  .strict();
export const statusInput = z.object({ id: z.string().min(1).max(64), status: z.enum(["open", "closed"]) }).strict();
export const assignInput = z
  .object({
    id: z.string().min(1).max(64),
    assigneeId: z.string().max(64).nullable().optional(),
    teamId: z.string().max(64).nullable().optional(),
  })
  .strict();

function messageRow(
  conversationId: string,
  kind: "in" | "out" | "note" | "event",
  body: string,
  authorUserId: string | null,
  at: number,
  extra: { delivery?: string; externalId?: string } = {},
) {
  return {
    id: crypto.randomUUID(),
    conversationId,
    kind,
    body,
    authorUserId,
    createdAt: at,
    delivery: extra.delivery ?? null,
    externalId: extra.externalId ?? null,
  };
}

/** Stores a reply and moves the conversation's latest activity, in one batch. */
export async function addReply(viewer: Viewer, id: string, body: string) {
  const conversation = await findVisible(viewer, id);
  if (!conversation) return null;
  const now = Date.now();
  const row = messageRow(id, "out", body, viewer.id, now, {
    delivery: conversation.channel === "whatsapp" ? "sending" : undefined,
  });
  await db.batch([
    db.insert(messages).values(row),
    db
      .update(conversations)
      .set({
        lastMessageAt: now,
        lastMessagePreview: preview(body),
        firstResponseAt: sql`coalesce(${conversations.firstResponseAt}, ${now})`,
      })
      .where(eq(conversations.id, id)),
  ]);
  await notifyChange(id);
  return { message: row, conversation };
}

export async function addNote(viewer: Viewer, id: string, body: string) {
  const conversation = await findVisible(viewer, id);
  if (!conversation) return null;
  await db.insert(messages).values(messageRow(id, "note", body, viewer.id, Date.now()));
  await notifyChange(id);
  return { ok: true };
}

export async function setStatus(viewer: Viewer, id: string, status: "open" | "closed") {
  const conversation = await findVisible(viewer, id);
  if (!conversation) return null;
  if (conversation.status === status) return { ok: true };
  const now = Date.now();
  await db.batch([
    db
      .update(conversations)
      .set({ status, closedAt: status === "closed" ? now : null })
      .where(eq(conversations.id, id)),
    db
      .insert(messages)
      .values(messageRow(id, "event", `${status === "closed" ? "Closed" : "Reopened"} by ${viewer.email}`, viewer.id, now)),
  ]);
  await notifyChange(id);
  return { ok: true };
}

export async function assign(viewer: Viewer, input: z.infer<typeof assignInput>) {
  const conversation = await findVisible(viewer, input.id);
  if (!conversation) return null;
  const now = Date.now();
  const change: { assigneeId?: string | null; teamId?: string | null } = {};
  const events: string[] = [];
  if (input.assigneeId !== undefined && input.assigneeId !== conversation.assigneeId) {
    if (input.assigneeId) {
      const [person] = await db.select().from(users).where(eq(users.id, input.assigneeId));
      if (!person) throw new Error("That teammate isn't known to the app yet.");
      events.push(
        conversation.assigneeId
          ? `Transferred to ${person.name || person.email} by ${viewer.email}`
          : `Assigned to ${person.name || person.email} by ${viewer.email}`,
      );
    } else {
      events.push(`Unassigned by ${viewer.email}`);
    }
    change.assigneeId = input.assigneeId;
  }
  if (input.teamId !== undefined && input.teamId !== conversation.teamId) {
    if (input.teamId) {
      const [team] = await db.select().from(teams).where(eq(teams.id, input.teamId));
      if (!team) throw new Error("That team no longer exists.");
      events.push(
        conversation.teamId
          ? `Moved to team ${team.name} by ${viewer.email}`
          : `Given to team ${team.name} by ${viewer.email}`,
      );
    } else {
      events.push(`Removed from its team by ${viewer.email}`);
    }
    change.teamId = input.teamId;
  }
  if (!events.length) return { ok: true };
  await db.batch([
    db.update(conversations).set(change).where(eq(conversations.id, input.id)),
    ...events.map((body, i) => db.insert(messages).values(messageRow(input.id, "event", body, viewer.id, now + i))),
  ]);
  await notifyChange(input.id);
  return { ok: true };
}

/**
 * Opens a conversation for a new inbound message, passing it through the
 * routing rules: the first rule whose keyword the message contains sets
 * the team, assignee and contact label; otherwise the default team applies.
 */
export async function openConversation(input: {
  contactId: string;
  channel: Channel;
  widgetId?: string | null;
  defaultTeamId: string | null;
  text: string;
  at: number;
  externalId?: string;
  visitorTokenHash?: string;
}) {
  const rules = await db.select().from(routingRules);
  const rule = matchRule(rules, input.text);
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(conversations).values({
      id,
      contactId: input.contactId,
      channel: input.channel,
      widgetId: input.widgetId ?? null,
      teamId: rule?.teamId ?? input.defaultTeamId,
      assigneeId: rule?.assigneeId ?? null,
      status: "open",
      visitorTokenHash: input.visitorTokenHash ?? null,
      lastMessageAt: input.at,
      lastMessagePreview: preview(input.text),
      createdAt: input.at,
    }),
    db.insert(messages).values(messageRow(id, "in", input.text, null, input.at, { externalId: input.externalId })),
    ...(rule?.labelId
      ? [db.insert(contactLabels).values({ contactId: input.contactId, labelId: rule.labelId }).onConflictDoNothing()]
      : []),
  ]);
  await notifyChange(id);
  return id;
}

/** Adds a customer's message to a conversation, reopening it when closed. */
export async function addInbound(conversationId: string, text: string, at: number, externalId?: string) {
  await db.batch([
    db.insert(messages).values(messageRow(conversationId, "in", text, null, at, { externalId })),
    db
      .update(conversations)
      .set({ lastMessageAt: at, lastMessagePreview: preview(text), status: "open", closedAt: null })
      .where(eq(conversations.id, conversationId)),
  ]);
  await notifyChange(conversationId);
}

export async function setDelivery(messageId: string, delivery: "sent" | "failed") {
  const [row] = await db
    .update(messages)
    .set({ delivery })
    .where(eq(messages.id, messageId))
    .returning({ conversationId: messages.conversationId });
  if (row) await notifyChange(row.conversationId);
}
