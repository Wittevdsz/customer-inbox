import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { CHANNEL_LABELS, errorMessage, shortTime } from "@/client/lib/format";
import { deleteContact, getContact, setContactLabel, updateContact } from "@/serverFunctions/contacts";

export const Route = createFileRoute("/contacts/$contactId")({
  loader: ({ params }) => getContact({ data: { id: params.contactId } }),
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.contact.name ?? "Contact"} · Customer Inbox` }] }),
  component: ContactPage,
});

const NOT_SET = "__not_set";

function BackToContacts() {
  return (
    <Link
      to="/contacts"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden />
      Contacts
    </Link>
  );
}

function ContactPage() {
  const data = Route.useLoaderData();
  if (!data) {
    return (
      <AppShell>
        <PageHeader title="Contact" backLink={<BackToContacts />} />
        <EmptyState kind="filtered" title="Contact not found" />
      </AppShell>
    );
  }
  return <ContactDetail key={data.contact.id} data={data} />;
}

function ContactDetail({ data }: { data: NonNullable<Awaited<ReturnType<typeof getContact>>> }) {
  const router = useRouter();
  const navigate = useNavigate();
  const { contact } = data;
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(data.fields.map((f) => [f.id, data.values[f.id] ?? ""])),
  );
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateContact({ data: { id: contact.id, name, email: email || null, phone: phone || null, values } });
      toast.success("Contact saved");
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(labelId: string, on: boolean) {
    try {
      await setContactLabel({ data: { id: contact.id, labelId, on } });
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  return (
    <AppShell>
      <PageHeader
        backLink={<BackToContacts />}
        title={contact.name}
        actions={
          data.admin ? (
            <Button variant="outline" onClick={() => setConfirming(true)}>
              Delete contact
            </Button>
          ) : null
        }
      />
      <form onSubmit={save} className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-xs">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="contact-name" label="Name" value={name} onChange={setName} required />
          <Field id="contact-email" label="Email" type="email" value={email} onChange={setEmail} />
          <Field id="contact-phone" label="Phone" value={phone} onChange={setPhone} />
          {contact.waId ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">WhatsApp</p>
              <p className="py-1.5 text-sm text-muted-foreground">{contact.waId}</p>
            </div>
          ) : null}
          {data.fields.map((field) =>
            field.type === "choice" ? (
              <div key={field.id} className="space-y-1.5">
                <p className="text-sm font-medium">{field.name}</p>
                <SimpleSelect
                  label={field.name}
                  className="w-full"
                  value={values[field.id] || NOT_SET}
                  options={[{ value: NOT_SET, label: "Not set" }, ...field.options.map((o) => ({ value: o, label: o }))]}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.id]: v === NOT_SET ? "" : v }))}
                />
              </div>
            ) : (
              <Field
                key={field.id}
                id={`field-${field.id}`}
                label={field.name}
                type={field.type === "text" ? "text" : field.type}
                value={values[field.id] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [field.id]: v }))}
              />
            ),
          )}
        </div>
        <div className="flex justify-end">
          <Button type="submit" pending={saving}>
            Save contact
          </Button>
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Labels</h2>
        {data.labels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No labels yet. An admin adds them in Settings.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.labels.map((label) => {
              const on = data.labelIds.includes(label.id);
              return (
                <Button
                  key={label.id}
                  type="button"
                  size="sm"
                  variant={on ? "default" : "outline"}
                  aria-pressed={on}
                  data-testid="label-toggle"
                  onClick={() => toggle(label.id, !on)}
                >
                  {label.name}
                </Button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Conversations</h2>
        {data.conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            {data.conversations.map((c) => (
              <li key={c.id}>
                <Link
                  to="/inbox/$conversationId"
                  params={{ conversationId: c.id }}
                  data-testid="contact-conversation"
                  className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/50"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{CHANNEL_LABELS[c.channel] ?? c.channel}</Badge>
                    <Badge variant={c.status === "open" ? "soft" : "secondary"}>{c.status === "open" ? "Open" : "Closed"}</Badge>
                    <span className="text-xs text-muted-foreground">{c.teamName ?? "No team"}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{shortTime(c.lastMessageAt)}</span>
                  </span>
                  <span className="truncate text-sm text-muted-foreground">{c.preview}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirming ? (
        <ConfirmDialog
          title={`Delete ${contact.name}?`}
          confirmLabel="Delete contact"
          destructive
          pending={deleting}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await deleteContact({ data: { id: contact.id } });
              await navigate({ to: "/contacts" });
            } catch (cause) {
              toast.error(errorMessage(cause));
              setDeleting(false);
              setConfirming(false);
            }
          }}
        >
          Their conversations and messages are deleted too.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}
