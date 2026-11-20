import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { listPeople } from "@/server/people";
import * as settings from "@/server/settings";
import { whatsappConfig } from "@/server/whatsapp";
import { viewerMiddleware } from "@/serverFunctions/middleware";


// Teams and routing

export const getTeamSettings = createServerFn()
  .middleware([viewerMiddleware])
  .handler(async ({ context: { viewer } }) => {
    const [teams, people, rules, labels] = await Promise.all([
      settings.listTeams(),
      listPeople(),
      settings.listRules(),
      settings.listLabels(),
    ]);
    return { teams, people, rules, labels, admin: viewer.admin };
  });

export const createTeam = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.teamInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.createTeam(viewer, data));
export const deleteTeam = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.idInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.deleteTeam(viewer, data.id));
export const addTeamMember = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.memberInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.addTeamMember(viewer, data));
export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.memberInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.removeTeamMember(viewer, data));
export const createRule = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.ruleInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.createRule(viewer, data));
export const moveRule = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.moveInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.moveRule(viewer, data));
export const deleteRule = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.idInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.deleteRule(viewer, data.id));

// Labels and custom fields

export const getContactSettings = createServerFn()
  .middleware([viewerMiddleware])
  .handler(async ({ context: { viewer } }) => {
    const [labels, fields] = await Promise.all([settings.listLabels(), settings.listFields()]);
    return { labels, fields, admin: viewer.admin };
  });

export const createLabel = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.labelInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.createLabel(viewer, data));
export const renameLabel = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.renameInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.renameLabel(viewer, data));
export const deleteLabel = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.idInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.deleteLabel(viewer, data.id));
export const createField = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.fieldInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.createField(viewer, data));
export const renameField = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.renameInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.renameField(viewer, data));
export const deleteField = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.idInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.deleteField(viewer, data.id));

// Channels

export const getChannels = createServerFn()
  .middleware([viewerMiddleware])
  .handler(async ({ context: { viewer } }) => {
    const origin = new URL(getRequest().url).origin;
    const [widgets, teams, whatsappTeamId] = await Promise.all([
      settings.listWidgets(),
      settings.listTeams(),
      settings.getSetting("whatsappTeamId"),
    ]);
    return {
      admin: viewer.admin,
      widgets: widgets.map((w) => ({ ...w, url: `${origin}/chat/${w.publicKey}` })),
      teams: teams.map((t) => ({ id: t.id, name: t.name })),
      whatsapp: whatsappConfig() ? { webhookUrl: `${origin}/hooks/whatsapp`, teamId: whatsappTeamId } : null,
    };
  });

export const createWidget = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.widgetInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.createWidget(viewer, data));
export const deleteWidget = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.idInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.deleteWidget(viewer, data.id));
export const setWhatsAppTeam = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.defaultTeamInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.setWhatsAppTeam(viewer, data));

// Quick replies

export const getQuickReplies = createServerFn()
  .middleware([viewerMiddleware])
  .handler(async ({ context: { viewer } }) => ({
    replies: await settings.listQuickReplies(viewer),
    admin: viewer.admin,
  }));

export const saveQuickReply = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.quickReplyInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.saveQuickReply(viewer, data));
export const deleteQuickReply = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => settings.idInput.parse(data))
  .handler(({ data, context: { viewer } }) => settings.deleteQuickReply(viewer, data.id));
