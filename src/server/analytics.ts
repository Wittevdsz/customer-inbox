import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contactLabels, conversations, messages, teams } from "@/db/schema";
import { CHANNELS, visibleTo } from "@/server/conversations";
import { daysBetween, median } from "@/server/logic";
import { nameMap } from "@/server/people";
import type { Viewer } from "@/server/viewer";

export const reportInput = z
  .object({
    days: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(90)]).default(30),
    teamId: z.string().max(64).optional(),
    agentId: z.string().max(64).optional(),
    channel: z.enum(CHANNELS).optional(),
    labelId: z.string().max(64).optional(),
  })
  .strict();

interface Row {
  key: string;
  label: string;
  conversations: number;
  closed: number;
  sent: number;
}

/** Figures over the conversations the viewer can see, for the period and filters. */
export async function report(viewer: Viewer, input: z.infer<typeof reportInput>) {
  const end = Date.now();
  const start = end - input.days * 24 * 60 * 60 * 1000;
  const scope = and(
    visibleTo(viewer),
    input.teamId ? eq(conversations.teamId, input.teamId) : undefined,
    input.agentId ? eq(conversations.assigneeId, input.agentId) : undefined,
    input.channel ? eq(conversations.channel, input.channel) : undefined,
    input.labelId
      ? sql`exists (select 1 from ${contactLabels} where ${contactLabels.contactId} = ${conversations.contactId} and ${contactLabels.labelId} = ${input.labelId})`
      : undefined,
  );
  const all = await db
    .select({
      id: conversations.id,
      channel: conversations.channel,
      teamId: conversations.teamId,
      assigneeId: conversations.assigneeId,
      status: conversations.status,
      createdAt: conversations.createdAt,
      closedAt: conversations.closedAt,
      firstResponseAt: conversations.firstResponseAt,
    })
    .from(conversations)
    .where(scope);
  const ids = all.map((c) => c.id);
  const sent = ids.length
    ? await db
        .select({ conversationId: messages.conversationId, authorUserId: messages.authorUserId, createdAt: messages.createdAt })
        .from(messages)
        .where(
          and(
            eq(messages.kind, "out"),
            gte(messages.createdAt, start),
            lte(messages.createdAt, end),
            ids.length <= 90 ? inArray(messages.conversationId, ids) : undefined,
          ),
        )
    : [];
  const idSet = new Set(ids);
  const sentInScope = sent.filter((m) => idSet.has(m.conversationId));
  const byId = new Map(all.map((c) => [c.id, c]));

  const created = all.filter((c) => c.createdAt >= start && c.createdAt <= end);
  const closed = all.filter((c) => c.status === "closed" && c.closedAt !== null && c.closedAt >= start && c.closedAt <= end);
  const open = all.filter((c) => c.status === "open");
  const responseTimes = created.filter((c) => c.firstResponseAt !== null).map((c) => c.firstResponseAt! - c.createdAt);

  const [names, teamRows] = await Promise.all([nameMap(), db.select({ id: teams.id, name: teams.name }).from(teams)]);
  const teamNames = new Map(teamRows.map((t) => [t.id, t.name]));

  function breakdown(
    keyOf: (c: (typeof all)[number]) => string,
    labelOf: (key: string) => string,
    sentKey: (m: (typeof sent)[number]) => string,
  ): Row[] {
    const rows = new Map<string, Row>();
    const row = (key: string) => {
      let found = rows.get(key);
      if (!found) rows.set(key, (found = { key, label: labelOf(key), conversations: 0, closed: 0, sent: 0 }));
      return found;
    };
    for (const c of created) row(keyOf(c)).conversations += 1;
    for (const c of closed) row(keyOf(c)).closed += 1;
    for (const m of sentInScope) row(sentKey(m)).sent += 1;
    return [...rows.values()].sort((a, b) => b.conversations - a.conversations || b.sent - a.sent);
  }

  const days = daysBetween(start, end);
  const perDay = new Map(days.map((d) => [d, { day: d, conversations: 0, sent: 0 }]));
  for (const c of created) perDay.get(new Date(c.createdAt).toISOString().slice(0, 10))!.conversations += 1;
  for (const m of sentInScope) {
    const entry = perDay.get(new Date(m.createdAt).toISOString().slice(0, 10));
    if (entry) entry.sent += 1;
  }

  return {
    totals: {
      created: created.length,
      closed: closed.length,
      open: open.length,
      sent: sentInScope.length,
      medianFirstResponseMs: median(responseTimes),
    },
    byAgent: breakdown(
      (c) => c.assigneeId ?? "",
      (k) => (k ? (names.get(k) ?? "Someone") : "Unassigned"),
      (m) => m.authorUserId ?? "",
    ),
    byTeam: breakdown(
      (c) => c.teamId ?? "",
      (k) => (k ? (teamNames.get(k) ?? "Deleted team") : "No team"),
      (m) => byId.get(m.conversationId)?.teamId ?? "",
    ),
    byChannel: breakdown(
      (c) => c.channel,
      (k) => (k === "whatsapp" ? "WhatsApp" : "Webchat"),
      (m) => byId.get(m.conversationId)?.channel ?? "webchat",
    ),
    daily: [...perDay.values()],
  };
}
