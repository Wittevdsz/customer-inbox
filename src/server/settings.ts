import { and, asc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  appSettings,
  contactFieldValues,
  contactLabels,
  conversations,
  customFields,
  labels,
  quickReplies,
  routingRules,
  teamMembers,
  teams,
  users,
  widgets,
} from "@/db/schema";
import { requireAdmin, type Viewer } from "@/server/viewer";

const id = z.string().min(1).max(64);
const name = z.string().trim().min(1, "Give it a name").max(80);
export const idInput = z.object({ id }).strict();

// Teams ------------------------------------------------------------------

export async function listTeams() {
  const [all, members] = await Promise.all([
    db.select().from(teams).orderBy(asc(teams.name)),
    db
      .select({ teamId: teamMembers.teamId, userId: users.id, email: users.email, name: users.name })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .orderBy(asc(users.email)),
  ]);
  return all.map((t) => ({
    id: t.id,
    name: t.name,
    members: members.filter((m) => m.teamId === t.id).map((m) => ({ id: m.userId, label: m.name || m.email })),
  }));
}

export const teamInput = z.object({ name }).strict();
export async function createTeam(viewer: Viewer, input: z.infer<typeof teamInput>) {
  requireAdmin(viewer);
  await db.insert(teams).values({ id: crypto.randomUUID(), name: input.name, createdAt: Date.now() });
}

export async function deleteTeam(viewer: Viewer, teamId: string) {
  requireAdmin(viewer);
  await db.batch([
    db.update(conversations).set({ teamId: null }).where(eq(conversations.teamId, teamId)),
    db.update(widgets).set({ defaultTeamId: null }).where(eq(widgets.defaultTeamId, teamId)),
    db.update(routingRules).set({ teamId: null }).where(eq(routingRules.teamId, teamId)),
    db.delete(teamMembers).where(eq(teamMembers.teamId, teamId)),
    db.delete(teams).where(eq(teams.id, teamId)),
  ]);
}

export const memberInput = z.object({ teamId: id, userId: id }).strict();
export async function addTeamMember(viewer: Viewer, input: z.infer<typeof memberInput>) {
  requireAdmin(viewer);
  const [[team], [person]] = await Promise.all([
    db.select().from(teams).where(eq(teams.id, input.teamId)),
    db.select().from(users).where(eq(users.id, input.userId)),
  ]);
  if (!team || !person) throw new Error("That team or teammate no longer exists.");
  await db.insert(teamMembers).values(input).onConflictDoNothing();
}

export async function removeTeamMember(viewer: Viewer, input: z.infer<typeof memberInput>) {
  requireAdmin(viewer);
  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.userId)));
}

// Routing rules -----------------------------------------------------------

export async function listRules() {
  return db.select().from(routingRules).orderBy(asc(routingRules.position));
}

export const ruleInput = z
  .object({
    keyword: z.string().trim().min(1, "Give a keyword").max(80),
    teamId: id.nullable(),
    assigneeId: id.nullable(),
    labelId: id.nullable(),
  })
  .strict()
  .refine((r) => r.teamId || r.assigneeId || r.labelId, "Pick a team, a teammate or a label");

export async function createRule(viewer: Viewer, input: z.infer<typeof ruleInput>) {
  requireAdmin(viewer);
  const rules = await listRules();
  const position = rules.length ? rules[rules.length - 1]!.position + 1 : 1;
  await db.insert(routingRules).values({ id: crypto.randomUUID(), position, ...input });
}

export const moveInput = z.object({ id, direction: z.enum(["up", "down"]) }).strict();
export async function moveRule(viewer: Viewer, input: z.infer<typeof moveInput>) {
  requireAdmin(viewer);
  const rules = await listRules();
  const at = rules.findIndex((r) => r.id === input.id);
  const other = rules[input.direction === "up" ? at - 1 : at + 1];
  const rule = rules[at];
  if (!rule || !other) return;
  await db.batch([
    db.update(routingRules).set({ position: other.position }).where(eq(routingRules.id, rule.id)),
    db.update(routingRules).set({ position: rule.position }).where(eq(routingRules.id, other.id)),
  ]);
}

export async function deleteRule(viewer: Viewer, ruleId: string) {
  requireAdmin(viewer);
  await db.delete(routingRules).where(eq(routingRules.id, ruleId));
}

// Labels and custom fields --------------------------------------------------

export function listLabels() {
  return db.select({ id: labels.id, name: labels.name }).from(labels).orderBy(asc(labels.name));
}

export const labelInput = z.object({ name }).strict();
export async function createLabel(viewer: Viewer, input: z.infer<typeof labelInput>) {
  requireAdmin(viewer);
  await db.insert(labels).values({ id: crypto.randomUUID(), name: input.name, createdAt: Date.now() });
}

export const renameInput = z.object({ id, name }).strict();
export async function renameLabel(viewer: Viewer, input: z.infer<typeof renameInput>) {
  requireAdmin(viewer);
  await db.update(labels).set({ name: input.name }).where(eq(labels.id, input.id));
}

export async function deleteLabel(viewer: Viewer, labelId: string) {
  requireAdmin(viewer);
  await db.batch([
    db.delete(contactLabels).where(eq(contactLabels.labelId, labelId)),
    db.update(routingRules).set({ labelId: null }).where(eq(routingRules.labelId, labelId)),
    db.delete(labels).where(eq(labels.id, labelId)),
  ]);
}

export const FIELD_TYPES = ["text", "number", "date", "choice"] as const;

export async function listFields() {
  const rows = await db.select().from(customFields).orderBy(asc(customFields.createdAt));
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type as (typeof FIELD_TYPES)[number],
    options: f.options ? f.options.split("\n") : [],
  }));
}

export const fieldInput = z
  .object({ name, type: z.enum(FIELD_TYPES), options: z.array(z.string().trim().min(1).max(80)).max(50) })
  .strict()
  .refine((f) => f.type !== "choice" || f.options.length > 0, "Add at least one choice");

export async function createField(viewer: Viewer, input: z.infer<typeof fieldInput>) {
  requireAdmin(viewer);
  await db.insert(customFields).values({
    id: crypto.randomUUID(),
    name: input.name,
    type: input.type,
    options: input.type === "choice" ? [...new Set(input.options)].join("\n") : "",
    createdAt: Date.now(),
  });
}

export async function renameField(viewer: Viewer, input: z.infer<typeof renameInput>) {
  requireAdmin(viewer);
  await db.update(customFields).set({ name: input.name }).where(eq(customFields.id, input.id));
}

export async function deleteField(viewer: Viewer, fieldId: string) {
  requireAdmin(viewer);
  await db.batch([
    db.delete(contactFieldValues).where(eq(contactFieldValues.fieldId, fieldId)),
    db.delete(customFields).where(eq(customFields.id, fieldId)),
  ]);
}

// Chat widgets --------------------------------------------------------------

export async function listWidgets() {
  return db
    .select({
      id: widgets.id,
      name: widgets.name,
      publicKey: widgets.publicKey,
      greeting: widgets.greeting,
      defaultTeamId: widgets.defaultTeamId,
      teamName: teams.name,
    })
    .from(widgets)
    .leftJoin(teams, eq(teams.id, widgets.defaultTeamId))
    .orderBy(asc(widgets.createdAt));
}

export const widgetInput = z
  .object({ name, greeting: z.string().trim().max(500), defaultTeamId: id.nullable() })
  .strict();

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

export async function createWidget(viewer: Viewer, input: z.infer<typeof widgetInput>) {
  requireAdmin(viewer);
  await db.insert(widgets).values({ id: crypto.randomUUID(), publicKey: randomKey(), createdAt: Date.now(), ...input });
}

export async function deleteWidget(viewer: Viewer, widgetId: string) {
  requireAdmin(viewer);
  await db.delete(widgets).where(eq(widgets.id, widgetId));
}

// Organization preferences ---------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return row?.value ?? null;
}

export const defaultTeamInput = z.object({ teamId: id.nullable() }).strict();
export async function setWhatsAppTeam(viewer: Viewer, input: z.infer<typeof defaultTeamInput>) {
  requireAdmin(viewer);
  if (input.teamId === null) {
    await db.delete(appSettings).where(eq(appSettings.key, "whatsappTeamId"));
    return;
  }
  await db
    .insert(appSettings)
    .values({ key: "whatsappTeamId", value: input.teamId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: input.teamId } });
}

// Quick replies -----------------------------------------------------------------

/** Shared replies and the viewer's own; never another member's personal ones. */
export async function listQuickReplies(viewer: Viewer) {
  const rows = await db
    .select()
    .from(quickReplies)
    .where(or(isNull(quickReplies.ownerUserId), eq(quickReplies.ownerUserId, viewer.id)))
    .orderBy(asc(quickReplies.shortcut));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    shortcut: r.shortcut,
    body: r.body,
    shared: r.ownerUserId === null,
    editable: r.ownerUserId === viewer.id || (r.ownerUserId === null && viewer.admin),
  }));
}

export const quickReplyInput = z
  .object({
    id: id.optional(),
    title: z.string().trim().min(1, "Give it a title").max(80),
    shortcut: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-_]{1,30}$/, "Use letters, digits, - or _ for the shortcut"),
    body: z.string().trim().min(1, "Write the reply").max(4000),
    shared: z.boolean(),
  })
  .strict();

export async function saveQuickReply(viewer: Viewer, input: z.infer<typeof quickReplyInput>) {
  if (input.shared) requireAdmin(viewer);
  const values = {
    title: input.title,
    shortcut: input.shortcut,
    body: input.body,
    ownerUserId: input.shared ? null : viewer.id,
  };
  if (!input.id) {
    await db.insert(quickReplies).values({ id: crypto.randomUUID(), createdAt: Date.now(), ...values });
    return;
  }
  await db.update(quickReplies).set(values).where(and(eq(quickReplies.id, input.id), ownedBy(viewer)));
}

function ownedBy(viewer: Viewer) {
  return viewer.admin
    ? or(isNull(quickReplies.ownerUserId), eq(quickReplies.ownerUserId, viewer.id))
    : eq(quickReplies.ownerUserId, viewer.id);
}

export async function deleteQuickReply(viewer: Viewer, replyId: string) {
  await db.delete(quickReplies).where(and(eq(quickReplies.id, replyId), ownedBy(viewer)));
}
