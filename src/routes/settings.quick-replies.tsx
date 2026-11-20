import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { PANEL, Section } from "@/client/components/Section";
import { SettingsNav } from "@/client/components/SettingsNav";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { useAction } from "@/client/hooks/useAction";
import { deleteQuickReply, getQuickReplies, saveQuickReply } from "@/serverFunctions/settings";

export const Route = createFileRoute("/settings/quick-replies")({
  loader: () => getQuickReplies(),
  head: () => ({ meta: [{ title: "Quick replies · Customer Inbox" }] }),
  component: QuickReplies,
});

type Reply = Awaited<ReturnType<typeof getQuickReplies>>["replies"][number];

function QuickReplies() {
  const data = Route.useLoaderData();
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<Reply | "new" | null>(null);

  return (
    <AppShell>
      <PageHeader title="Settings" />
      <SettingsNav />
      <Section
        title="Quick replies"
        description="Type / in a reply, or use the Quick replies menu, to insert one."
        actions={<Button onClick={() => setEditing("new")}>New quick reply</Button>}
      >
        {data.replies.length === 0 ? (
          <EmptyState title="No quick replies yet" />
        ) : (
          <ul className={`${PANEL} divide-y divide-border`}>
            {data.replies.map((r) => (
              <li key={r.id} data-testid="qr-row" className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.title}</span>
                  <code className="text-xs text-muted-foreground">/{r.shortcut}</code>
                  <Badge variant={r.shared ? "soft" : "secondary"}>{r.shared ? "Everyone" : "Only me"}</Badge>
                  {r.editable ? (
                    <span className="ml-auto flex gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.title}`} onClick={() => setEditing(r)}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${r.title}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => run(() => deleteQuickReply({ data: { id: r.id } }))}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  ) : null}
                </div>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {editing ? (
        <ReplyDialog
          reply={editing === "new" ? null : editing}
          admin={data.admin}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            if (await run(() => saveQuickReply({ data: input }))) setEditing(null);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function ReplyDialog({
  reply,
  admin,
  pending,
  onClose,
  onSave,
}: {
  reply: Reply | null;
  admin: boolean;
  pending: boolean;
  onClose: () => void;
  onSave: (input: { id?: string; title: string; shortcut: string; body: string; shared: boolean }) => Promise<void>;
}) {
  const [title, setTitle] = useState(reply?.title ?? "");
  const [shortcut, setShortcut] = useState(reply?.shortcut ?? "");
  const [body, setBody] = useState(reply?.body ?? "");
  const [shared, setShared] = useState(reply?.shared ?? false);

  function submit(event: FormEvent) {
    event.preventDefault();
    void onSave({ id: reply?.id, title, shortcut: shortcut.replace(/^\//, ""), body, shared });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{reply ? "Edit quick reply" : "New quick reply"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="qr-title">Title</Label>
            <Input id="qr-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qr-shortcut">Shortcut</Label>
            <Input id="qr-shortcut" value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="thanks" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qr-body">Reply</Label>
            <Textarea id="qr-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} required />
          </div>
          {admin ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Visible to</p>
              <SimpleSelect
                label="Visible to"
                className="w-full"
                value={shared ? "everyone" : "me"}
                options={[
                  { value: "me", label: "Only me" },
                  { value: "everyone", label: "Everyone" },
                ]}
                onChange={(v) => setShared(v === "everyone")}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="submit" pending={pending}>
              Save quick reply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
