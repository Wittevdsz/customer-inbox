import { createServerFn } from "@tanstack/react-start";
import * as contacts from "@/server/contacts";
import { listFields, listLabels } from "@/server/settings";
import { viewerMiddleware } from "@/serverFunctions/middleware";

export const getContacts = createServerFn()
  .middleware([viewerMiddleware])
  .validator((data: unknown) => contacts.listContactsInput.parse(data ?? {}))
  .handler(async ({ data, context: { viewer } }) => {
    const [rows, labels] = await Promise.all([contacts.listContacts(viewer, data), listLabels()]);
    return { rows, labels };
  });

export const getContact = createServerFn()
  .middleware([viewerMiddleware])
  .validator((data: unknown) => contacts.idInput.parse(data))
  .handler(async ({ data, context: { viewer } }) => {
    const found = await contacts.getContact(viewer, data.id);
    if (!found) return null;
    const [labels, fields] = await Promise.all([listLabels(), listFields()]);
    return { ...found, labels, fields, admin: viewer.admin };
  });

export const updateContact = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => contacts.updateContactInput.parse(data))
  .handler(async ({ data, context: { viewer } }) => {
    if (!(await contacts.updateContact(viewer, data))) throw new Error("Contact not found");
    return { ok: true };
  });

export const setContactLabel = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => contacts.contactLabelInput.parse(data))
  .handler(async ({ data, context: { viewer } }) => {
    if (!(await contacts.setContactLabel(viewer, data))) throw new Error("Contact not found");
    return { ok: true };
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([viewerMiddleware])
  .validator((data: unknown) => contacts.idInput.parse(data))
  .handler(({ data, context: { viewer } }) => contacts.deleteContact(viewer, data.id));
