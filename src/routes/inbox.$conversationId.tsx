import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, MessageSquareText, StickyNote } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { Textarea } from "@/client/components/ui/textarea";
import { useLive } from "@/client/hooks/useLive";
import { CHANNEL_LABELS, errorMessage, shortTime } from "@/client/lib/format";
import {
  addNote,
  assignConversation,
  getConversation,
  sendReply,
  setStatus,
} from "@/serverFunctions/inbox";

export const Route = createFileRoute("/inbox/$conversationId")({
  loader: ({ params }) => getConversation({ data: { id: params.conversationId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.contact?.name ?? "Conversation"} · Customer Inbox` }],
  }),
  component: ConversationPage,
});

const BACK = "inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground";
const NONE = "none";

function BackToInbox() {
  return (
    <Link to="/inbox" className={BACK}>
      <ChevronLeft className="size-4" aria-hidden />
      Inbox
    </Link>
  );
}

function ConversationPage() {
  const data = Route.useLoaderData();
  const { conversationId } = Route.useParams();
  const router = useRouter();
  useLive(data ? `/live/conversations/${conversationId}` : null, () => void router.invalidate());

  if (!data) {
    return (
      <AppShell>
        <PageHeader title="Conversation" backLink={<BackToInbox />} />
        <EmptyState kind="filtered" title="Conversation not found" />
      </AppShell>
    );
  }

  const { conversation, contact, messages } = data;
  const open = conversation.status === "open";

  async function run(work: () => Promise<unknown>) {
    try {
      await work();
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  return (
    <AppShell wide>
      <PageHeader
        backLink={<BackToInbox />}
        title={contact?.name ?? "Conversation"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{CHANNEL_LABELS[conversation.channel]}</Badge>
            <Badge variant={open ? "soft" : "secondary"} data-testid="conversation-status">
              {open ? "Open" : "Closed"}
            </Badge>
          </span>
        }
        actions={
          <Button
            variant="outline"
            onClick={() => run(() => setStatus({ data: { id: conversation.id, status: open ? "closed" : "open" } }))}
          >
            {open ? "Close conversation" : "Reopen"}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="min-w-0 space-y-4">
          <ol data-testid="thread" className="space-y-3">
            {messages.map((m) => (
              <MessageItem key={m.id} message={m} />
            ))}
          </ol>
          <Composer conversationId={conversation.id} quickReplies={data.quickReplies} onDone={() => router.invalidate()} />
        </section>
        <aside className="space-y-4">
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-xs">
            <h2 className="text-sm font-semibold">Handled by</h2>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Assignee</p>
              <SimpleSelect
                label="Assignee"
                className="w-full"
                value={conversation.assigneeId ?? NONE}
                options={[{ value: NONE, label: "Unassigned" }, ...data.people.map((p) => ({ value: p.id, label: p.label }))]}
                onChange={(v) =>
                  run(() => assignConversation({ data: { id: conversation.id, assigneeId: v === NONE ? null : v } }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Team</p>
              <SimpleSelect
                label="Team"
                className="w-full"
                value={conversation.teamId ?? NONE}
                options={[{ value: NONE, label: "No team" }, ...data.teams.map((t) => ({ value: t.id, label: t.name }))]}
                onChange={(v) =>
                  run(() => assignConversation({ data: { id: conversation.id, teamId: v === NONE ? null : v } }))
                }
              />
            </div>
          </div>
          {contact ? (
            <div data-testid="contact-panel" className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold">{contact.name}</h2>
                <Link
                  to="/contacts/$contactId"
                  params={{ contactId: contact.id }}
                  className="text-xs text-primary hover:underline"
                >
                  Open contact
                </Link>
              </div>
              <dl className="space-y-1 text-sm">
                {contact.email ? <Detail term="Email" value={contact.email} /> : null}
                {contact.phone ? <Detail term="Phone" value={contact.phone} /> : null}
                {contact.waId ? <Detail term="WhatsApp" value={contact.waId} /> : null}
                {contact.values.map((v) => (
                  <Detail key={v.name} term={v.name} value={v.value} />
                ))}
              </dl>
              {contact.labels.length ? (
                <div className="flex flex-wrap gap-1">
                  {contact.labels.map((l) => (
                    <Badge key={l} variant="secondary">
                      {l}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}

type Message = NonNullable<Awaited<ReturnType<typeof getConversation>>>["messages"][number];

function MessageItem({ message: m }: { message: Message }) {
  if (m.kind === "event") {
    return (
      <li data-testid="message" data-kind="event" className="text-center text-xs text-muted-foreground">
        {m.body} · {shortTime(m.createdAt)}
      </li>
    );
  }
  if (m.kind === "note") {
    return (
      <li
        data-testid="message"
        data-kind="note"
        className="space-y-1 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2"
      >
        <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <StickyNote className="size-3.5" aria-hidden />
          Internal note · {m.author} · {shortTime(m.createdAt)}
        </p>
        <p className="text-sm whitespace-pre-wrap">{m.body}</p>
      </li>
    );
  }
  const outgoing = m.kind === "out";
  return (
    <li data-testid="message" data-kind={m.kind} className={outgoing ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          outgoing
            ? "max-w-[85%] space-y-1 rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground"
            : "max-w-[85%] space-y-1 rounded-2xl rounded-bl-sm bg-muted px-3 py-2"
        }
      >
        <p className="text-sm whitespace-pre-wrap">{m.body}</p>
        <p className={outgoing ? "text-xs text-primary-foreground/75" : "text-xs text-muted-foreground"}>
          {outgoing ? `${m.author} · ` : ""}
          {shortTime(m.createdAt)}
          {m.delivery === "failed" ? " · Not delivered" : ""}
        </p>
      </div>
    </li>
  );
}

interface QuickReply {
  id: string;
  title: string;
  shortcut: string;
  body: string;
}

function Composer({
  conversationId,
  quickReplies,
  onDone,
}: {
  conversationId: string;
  quickReplies: QuickReply[];
  onDone: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);

  const slash = /^\/(\S*)$/.exec(text);
  const suggestions = slash
    ? quickReplies.filter(
        (q) => q.shortcut.startsWith(slash[1]!.toLowerCase()) || q.title.toLowerCase().includes(slash[1]!.toLowerCase()),
      )
    : [];

  const insert = (q: QuickReply) => setText((current) => (current.trim() === "" || current.startsWith("/") ? q.body : `${current} ${q.body}`));

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = text.trim();
    if (!body || pending) return;
    setPending(true);
    try {
      const send = mode === "reply" ? sendReply : addNote;
      await send({ data: { id: conversationId, body } });
      setText("");
      await onDone();
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={mode} onValueChange={(v) => setMode(v as "reply" | "note")}>
          <TabsList>
            <TabsTrigger value="reply">Reply</TabsTrigger>
            <TabsTrigger value="note">Internal note</TabsTrigger>
          </TabsList>
        </Tabs>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
            <MessageSquareText aria-hidden />
            Quick replies
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {quickReplies.length === 0 ? (
              <DropdownMenuItem disabled>None saved yet</DropdownMenuItem>
            ) : (
              quickReplies.map((q) => (
                <DropdownMenuItem key={q.id} onClick={() => insert(q)}>
                  <span className="min-w-0 flex-1 truncate">{q.title}</span>
                  <span className="text-xs text-muted-foreground">/{q.shortcut}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {suggestions.length ? (
        <div data-testid="quick-reply-suggestions" className="flex flex-col rounded-lg border border-border">
          {suggestions.map((q) => (
            <Button
              key={q.id}
              type="button"
              variant="ghost"
              className="h-auto justify-start rounded-none py-2 text-left"
              onClick={() => insert(q)}
            >
              <span className="font-medium">{q.title}</span>
              <span className="text-xs text-muted-foreground">/{q.shortcut}</span>
            </Button>
          ))}
        </div>
      ) : null}
      <Textarea
        aria-label="Message"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
        }}
        placeholder={mode === "reply" ? "Type / for quick replies" : "Only your team sees notes"}
        rows={3}
        className={mode === "note" ? "border-dashed bg-primary/5" : undefined}
      />
      <div className="flex justify-end">
        <Button type="submit" pending={pending} disabled={!text.trim()}>
          {mode === "reply" ? "Send" : "Add note"}
        </Button>
      </div>
    </form>
  );
}
