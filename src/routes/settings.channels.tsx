import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { CopyButton } from "@/client/components/CopyButton";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { PANEL, Section } from "@/client/components/Section";
import { SettingsNav } from "@/client/components/SettingsNav";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { useAction } from "@/client/hooks/useAction";
import { createWidget, deleteWidget, getChannels, setWhatsAppTeam } from "@/serverFunctions/settings";

export const Route = createFileRoute("/settings/channels")({
  loader: () => getChannels(),
  head: () => ({ meta: [{ title: "Channels · Customer Inbox" }] }),
  component: Channels,
});

const NONE = "none";

function snippet(url: string) {
  return `<a href="${url}" target="_blank" rel="noopener">Chat with us</a>`;
}

function Channels() {
  const data = Route.useLoaderData();
  const { run, pending } = useAction();
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const teamOptions = [{ value: NONE, label: "No team" }, ...data.teams.map((t) => ({ value: t.id, label: t.name }))];

  return (
    <AppShell>
      <PageHeader title="Settings" />
      <SettingsNav />

      <Section
        title="Chat widgets"
        description="Put a widget's snippet on your website."
        actions={data.admin ? <Button onClick={() => setCreating(true)}>New chat widget</Button> : null}
      >
        {data.widgets.length === 0 ? (
          <EmptyState title="No chat widgets yet" />
        ) : (
          <ul className={`${PANEL} divide-y divide-border`}>
            {data.widgets.map((w) => (
              <li key={w.id} data-testid="widget-row" className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">{w.name}</p>
                    <p className="text-sm text-muted-foreground">Default team: {w.teamName ?? "none"}</p>
                    {w.greeting ? <p className="text-sm text-muted-foreground">“{w.greeting}”</p> : null}
                  </div>
                  {data.admin ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${w.name}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setRemoving(w)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
                <a
                  data-testid="widget-link"
                  href={w.url}
                  target="_blank"
                  rel="noopener"
                  className="block truncate text-sm text-primary hover:underline"
                >
                  {w.url}
                </a>
                <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2">
                  <code data-testid="widget-snippet" className="min-w-0 flex-1 text-xs break-all">
                    {snippet(w.url)}
                  </code>
                  <CopyButton value={snippet(w.url)} successMessage="Snippet copied" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.whatsapp ? (
        <Section title="WhatsApp">
          <div className={`${PANEL} space-y-3 p-4`}>
            <div className="space-y-1">
              <p className="text-sm font-medium">Webhook URL</p>
              <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2">
                <code data-testid="whatsapp-webhook" className="min-w-0 flex-1 text-xs break-all">
                  {data.whatsapp.webhookUrl}
                </code>
                <CopyButton value={data.whatsapp.webhookUrl} successMessage="URL copied" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Default team</p>
              <SimpleSelect
                label="WhatsApp default team"
                value={data.whatsapp.teamId ?? NONE}
                options={teamOptions}
                disabled={!data.admin}
                onChange={(v) => run(() => setWhatsAppTeam({ data: { teamId: v === NONE ? null : v } }))}
              />
            </div>
          </div>
        </Section>
      ) : null}

      {creating ? (
        <NewWidgetDialog
          teamOptions={teamOptions}
          pending={pending}
          onClose={() => setCreating(false)}
          onCreate={async (input) => {
            if (await run(() => createWidget({ data: input }))) setCreating(false);
          }}
        />
      ) : null}

      {removing ? (
        <ConfirmDialog
          title={`Delete ${removing.name}?`}
          confirmLabel="Delete widget"
          destructive
          pending={pending}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await run(() => deleteWidget({ data: { id: removing.id } }));
            setRemoving(null);
          }}
        >
          Its link stops working. Its conversations stay in the inbox.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}

function NewWidgetDialog({
  teamOptions,
  pending,
  onClose,
  onCreate,
}: {
  teamOptions: { value: string; label: string }[];
  pending: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; greeting: string; defaultTeamId: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("");
  const [team, setTeam] = useState(NONE);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    void onCreate({ name, greeting, defaultTeamId: team === NONE ? null : team });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New chat widget</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="widget-name">Name</Label>
            <Input id="widget-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="widget-greeting">Greeting</Label>
            <Textarea id="widget-greeting" value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Default team</p>
            <SimpleSelect label="Default team" className="w-full" value={team} options={teamOptions} onChange={setTeam} />
          </div>
          <DialogFooter>
            <Button type="submit" pending={pending}>
              Create widget
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
