import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { PANEL, Section } from "@/client/components/Section";
import { SettingsNav } from "@/client/components/SettingsNav";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { useAction } from "@/client/hooks/useAction";
import {
  createField,
  createLabel,
  deleteField,
  deleteLabel,
  getContactSettings,
  renameField,
  renameLabel,
} from "@/serverFunctions/settings";

export const Route = createFileRoute("/settings/contacts")({
  loader: () => getContactSettings(),
  head: () => ({ meta: [{ title: "Labels & fields · Customer Inbox" }] }),
  component: ContactSettings,
});

const TYPE_LABELS = { text: "Text", number: "Number", date: "Date", choice: "Choice" } as const;
type FieldType = keyof typeof TYPE_LABELS;

function ContactSettings() {
  const data = Route.useLoaderData();
  const { run, pending } = useAction();
  const [labelName, setLabelName] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [fieldOptions, setFieldOptions] = useState("");
  const [deleting, setDeleting] = useState<{ kind: "label" | "field"; id: string; name: string } | null>(null);

  async function addLabel(event: FormEvent) {
    event.preventDefault();
    if (!labelName.trim()) return;
    if (await run(() => createLabel({ data: { name: labelName } }))) setLabelName("");
  }

  async function addField(event: FormEvent) {
    event.preventDefault();
    if (!fieldName.trim()) return;
    const options = fieldOptions
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    if (await run(() => createField({ data: { name: fieldName, type: fieldType, options } }))) {
      setFieldName("");
      setFieldOptions("");
      setFieldType("text");
    }
  }

  return (
    <AppShell>
      <PageHeader title="Settings" />
      <SettingsNav />

      <Section title="Labels">
        {data.admin ? (
          <form onSubmit={addLabel} className="flex gap-2">
            <Input
              id="label-name"
              aria-label="New label"
              placeholder="Label name"
              value={labelName}
              onChange={(e) => setLabelName(e.target.value)}
              className="bg-card"
            />
            <Button type="submit" disabled={pending}>
              Add label
            </Button>
          </form>
        ) : null}
        {data.labels.length === 0 ? (
          <EmptyState title="No labels yet" />
        ) : (
          <ul className={`${PANEL} divide-y divide-border`}>
            {data.labels.map((label) => (
              <NamedRow
                key={label.id}
                testId="label-row"
                name={label.name}
                inputLabel="Label name"
                admin={data.admin}
                onRename={(name) => run(() => renameLabel({ data: { id: label.id, name } }))}
                onDelete={() => setDeleting({ kind: "label", ...label })}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Custom fields" description="Filled in on each contact's page.">
        {data.admin ? (
          <form onSubmit={addField} className={`${PANEL} flex flex-wrap items-center gap-2 p-4`}>
            <Input
              id="field-name"
              aria-label="New field"
              placeholder="Field name"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              className="w-44"
            />
            <SimpleSelect
              label="Field type"
              value={fieldType}
              options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(v) => setFieldType(v as FieldType)}
            />
            {fieldType === "choice" ? (
              <Input
                id="field-options"
                aria-label="Choices"
                placeholder="Choices, separated by commas"
                value={fieldOptions}
                onChange={(e) => setFieldOptions(e.target.value)}
                className="min-w-56 flex-1"
              />
            ) : null}
            <Button type="submit" disabled={pending}>
              Add field
            </Button>
          </form>
        ) : null}
        {data.fields.length === 0 ? (
          <EmptyState title="No custom fields yet" />
        ) : (
          <ul className={`${PANEL} divide-y divide-border`}>
            {data.fields.map((field) => (
              <NamedRow
                key={field.id}
                testId="field-row"
                name={field.name}
                inputLabel="Field name"
                admin={data.admin}
                detail={
                  <>
                    <Badge variant="outline">{TYPE_LABELS[field.type]}</Badge>
                    {field.options.length ? (
                      <span className="truncate text-xs text-muted-foreground">{field.options.join(", ")}</span>
                    ) : null}
                  </>
                }
                onRename={(name) => run(() => renameField({ data: { id: field.id, name } }))}
                onDelete={() => setDeleting({ kind: "field", id: field.id, name: field.name })}
              />
            ))}
          </ul>
        )}
      </Section>

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          confirmLabel={deleting.kind === "label" ? "Delete label" : "Delete field"}
          destructive
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await run(() =>
              deleting.kind === "label" ? deleteLabel({ data: { id: deleting.id } }) : deleteField({ data: { id: deleting.id } }),
            );
            setDeleting(null);
          }}
        >
          {deleting.kind === "label" ? "It comes off every contact." : "Every contact's value for it is deleted."}
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

function NamedRow({
  testId,
  name,
  inputLabel,
  admin,
  detail,
  onRename,
  onDelete,
}: {
  testId: string;
  name: string;
  inputLabel: string;
  admin: boolean;
  detail?: React.ReactNode;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  if (editing) {
    return (
      <li data-testid={testId} className="px-4 py-2">
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (value.trim() && (await onRename(value.trim()))) setEditing(false);
          }}
        >
          <Input aria-label={inputLabel} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <Button type="submit">Save</Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      </li>
    );
  }
  return (
    <li data-testid={testId} className="flex items-center gap-2 px-4 py-2.5">
      <span className="font-medium">{name}</span>
      {detail}
      {admin ? (
        <span className="ml-auto flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Rename"
            onClick={() => {
              setValue(name);
              setEditing(true);
            }}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete"
            className="text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </span>
      ) : null}
    </li>
  );
}
