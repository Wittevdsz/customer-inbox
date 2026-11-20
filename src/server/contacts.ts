import { and, asc, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  contactFieldValues,
  contactLabels,
  contacts,
  conversations,
  customFields,
  labels,
  messages,
  teams,
} from "@/db/schema";
import { visibleTo } from "@/server/conversations";
import { requireAdmin, type Viewer } from "@/server/viewer";

/** A contact is visible with one visible conversation, or none at all. */
function contactVisibleTo(viewer: Viewer): SQL | undefined {
  if (viewer.admin) return undefined;
  const teamList = viewer.teamIds.length
    ? sql`${conversations.teamId} in (${sql.join(
        viewer.teamIds.map((t) => sql`${t}`),
        sql`, `,
      )})`
    : sql`0`;
  return sql`(exists (select 1 from ${conversations} where ${conversations.contactId} = ${contacts.id} and (${conversations.teamId} is null or ${conversations.assigneeId} = ${viewer.id} or ${teamList})) or not exists (select 1 from ${conversations} where ${conversations.contactId} = ${contacts.id}))`;
}

export const listContactsInput = z
  .object({ q: z.string().trim().max(200).optional(), labelId: z.string().max(64).optional() })
  .strict();

export async function listContacts(viewer: Viewer, input: z.infer<typeof listContactsInput>) {
  const term = input.q ? `%${input.q.replace(/[%_]/g, "")}%` : null;
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      waId: contacts.waId,
      createdAt: contacts.createdAt,
    })
    .from(contacts)
    .where(
      and(
        contactVisibleTo(viewer),
        term ? or(like(contacts.name, term), like(contacts.email, term), like(contacts.phone, term), like(contacts.waId, term)) : undefined,
        input.labelId
          ? sql`exists (select 1 from ${contactLabels} where ${contactLabels.contactId} = ${contacts.id} and ${contactLabels.labelId} = ${input.labelId})`
          : undefined,
      ),
    )
    .orderBy(asc(contacts.name))
    .limit(500);
  const ids = rows.map((r) => r.id);
  const tags = ids.length
    ? await db
        .select({ contactId: contactLabels.contactId, name: labels.name })
        .from(contactLabels)
        .innerJoin(labels, eq(labels.id, contactLabels.labelId))
        .where(inArray(contactLabels.contactId, ids))
    : [];
  return rows.map((r) => ({ ...r, labels: tags.filter((t) => t.contactId === r.id).map((t) => t.name) }));
}

async function findContact(viewer: Viewer, id: string) {
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), contactVisibleTo(viewer)));
  return row ?? null;
}

export async function getContact(viewer: Viewer, id: string) {
  const contact = await findContact(viewer, id);
  if (!contact) return null;
  const [labelIds, values, history] = await Promise.all([
    db.select({ labelId: contactLabels.labelId }).from(contactLabels).where(eq(contactLabels.contactId, id)),
    db.select().from(contactFieldValues).where(eq(contactFieldValues.contactId, id)),
    db
      .select({
        id: conversations.id,
        channel: conversations.channel,
        status: conversations.status,
        preview: conversations.lastMessagePreview,
        lastMessageAt: conversations.lastMessageAt,
        teamName: teams.name,
      })
      .from(conversations)
      .leftJoin(teams, eq(teams.id, conversations.teamId))
      .where(and(eq(conversations.contactId, id), visibleTo(viewer)))
      .orderBy(desc(conversations.lastMessageAt)),
  ]);
  return {
    contact,
    labelIds: labelIds.map((l) => l.labelId),
    values: Object.fromEntries(values.map((v) => [v.fieldId, v.value])),
    conversations: history,
  };
}

const optionalText = z.string().trim().max(200).nullable().optional();

export const updateContactInput = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().trim().min(1, "Give the contact a name").max(200),
    email: optionalText,
    phone: optionalText,
    values: z.record(z.string().max(64), z.string().trim().max(1000)),
  })
  .strict();

export async function updateContact(viewer: Viewer, input: z.infer<typeof updateContactInput>) {
  const contact = await findContact(viewer, input.id);
  if (!contact) return null;
  const fields = await db.select().from(customFields);
  const writes = [];
  for (const field of fields) {
    const value = input.values[field.id];
    if (value === undefined) continue;
    if (value === "") {
      writes.push(
        db
          .delete(contactFieldValues)
          .where(and(eq(contactFieldValues.contactId, input.id), eq(contactFieldValues.fieldId, field.id))),
      );
      continue;
    }
    if (field.type === "number" && !Number.isFinite(Number(value))) throw new Error(`${field.name} must be a number.`);
    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field.name} must be a date.`);
    if (field.type === "choice" && !field.options.split("\n").includes(value)) throw new Error(`Pick one of the choices for ${field.name}.`);
    writes.push(
      db
        .insert(contactFieldValues)
        .values({ contactId: input.id, fieldId: field.id, value })
        .onConflictDoUpdate({ target: [contactFieldValues.contactId, contactFieldValues.fieldId], set: { value } }),
    );
  }
  await db.batch([
    db
      .update(contacts)
      .set({ name: input.name, email: input.email || null, phone: input.phone || null })
      .where(eq(contacts.id, input.id)),
    ...writes,
  ]);
  return { ok: true };
}

export const contactLabelInput = z
  .object({ id: z.string().min(1).max(64), labelId: z.string().min(1).max(64), on: z.boolean() })
  .strict();

export async function setContactLabel(viewer: Viewer, input: z.infer<typeof contactLabelInput>) {
  const contact = await findContact(viewer, input.id);
  if (!contact) return null;
  if (input.on) {
    const [label] = await db.select().from(labels).where(eq(labels.id, input.labelId));
    if (!label) throw new Error("That label no longer exists.");
    await db.insert(contactLabels).values({ contactId: input.id, labelId: input.labelId }).onConflictDoNothing();
  } else {
    await db
      .delete(contactLabels)
      .where(and(eq(contactLabels.contactId, input.id), eq(contactLabels.labelId, input.labelId)));
  }
  return { ok: true };
}

/** Deletes a contact with its conversations, messages, labels and field values, in one batch. */
export async function deleteContact(viewer: Viewer, id: string) {
  requireAdmin(viewer);
  const ids = db.select({ id: conversations.id }).from(conversations).where(eq(conversations.contactId, id));
  await db.batch([
    db.delete(messages).where(inArray(messages.conversationId, ids)),
    db.delete(conversations).where(eq(conversations.contactId, id)),
    db.delete(contactLabels).where(eq(contactLabels.contactId, id)),
    db.delete(contactFieldValues).where(eq(contactFieldValues.contactId, id)),
    db.delete(contacts).where(eq(contacts.id, id)),
  ]);
  return { ok: true };
}

/** The contact panel beside a conversation. */
export async function contactSummary(id: string) {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  if (!contact) return null;
  const tags = await db
    .select({ name: labels.name })
    .from(contactLabels)
    .innerJoin(labels, eq(labels.id, contactLabels.labelId))
    .where(eq(contactLabels.contactId, id));
  const values = await db
    .select({ name: customFields.name, value: contactFieldValues.value })
    .from(contactFieldValues)
    .innerJoin(customFields, eq(customFields.id, contactFieldValues.fieldId))
    .where(eq(contactFieldValues.contactId, id));
  return { ...contact, labels: tags.map((t) => t.name), values };
}

export const idInput = z.object({ id: z.string().min(1).max(64) }).strict();
