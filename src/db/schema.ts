import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Times are milliseconds since the epoch.

/** People who opened the app, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const teamMembers = sqliteTable(
  "team_members",
  {
    teamId: text("team_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    /** The WhatsApp number the contact writes from. */
    waId: text("wa_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("contacts_wa_id").on(t.waId)],
);

export const labels = sqliteTable("labels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const contactLabels = sqliteTable(
  "contact_labels",
  {
    contactId: text("contact_id").notNull(),
    labelId: text("label_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.labelId] })],
);

export const customFields = sqliteTable("custom_fields", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** text | number | date | choice */
  type: text("type").notNull(),
  /** Choices, one per line, for a choice field. */
  options: text("options").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

export const contactFieldValues = sqliteTable(
  "contact_field_values",
  {
    contactId: text("contact_id").notNull(),
    fieldId: text("field_id").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.fieldId] })],
);

export const widgets = sqliteTable("widgets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** The random key in the public chat link. */
  publicKey: text("public_key").notNull().unique(),
  greeting: text("greeting").notNull().default(""),
  defaultTeamId: text("default_team_id"),
  createdAt: integer("created_at").notNull(),
});

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id").notNull(),
    /** webchat | whatsapp */
    channel: text("channel").notNull(),
    widgetId: text("widget_id"),
    teamId: text("team_id"),
    assigneeId: text("assignee_id"),
    /** open | closed */
    status: text("status").notNull().default("open"),
    /** SHA-256 of the visitor's token, for webchat. */
    visitorTokenHash: text("visitor_token_hash"),
    lastMessageAt: integer("last_message_at").notNull(),
    lastMessagePreview: text("last_message_preview").notNull().default(""),
    firstResponseAt: integer("first_response_at"),
    closedAt: integer("closed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("conversations_last").on(t.lastMessageAt),
    index("conversations_contact").on(t.contactId),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    /** in (from the customer) | out (a reply) | note (internal) | event (a logged change) */
    kind: text("kind").notNull(),
    authorUserId: text("author_user_id"),
    body: text("body").notNull(),
    /** For WhatsApp replies: sending | sent | failed */
    delivery: text("delivery"),
    /** The channel's own message id, so a webhook retry isn't stored twice. */
    externalId: text("external_id").unique(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("messages_conversation").on(t.conversationId, t.createdAt)],
);

export const quickReplies = sqliteTable("quick_replies", {
  id: text("id").primaryKey(),
  /** Null for a shared reply. */
  ownerUserId: text("owner_user_id"),
  title: text("title").notNull(),
  shortcut: text("shortcut").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const routingRules = sqliteTable("routing_rules", {
  id: text("id").primaryKey(),
  keyword: text("keyword").notNull(),
  teamId: text("team_id"),
  assigneeId: text("assignee_id"),
  labelId: text("label_id"),
  position: integer("position").notNull(),
});

/** Organization-wide preferences, such as WhatsApp's default team. */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
