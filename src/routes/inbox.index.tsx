import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Badge } from "@/client/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { useLive } from "@/client/hooks/useLive";
import { CHANNEL_LABELS, shortTime } from "@/client/lib/format";
import { getInbox } from "@/serverFunctions/inbox";

interface InboxSearch {
  view?: "mine" | "unassigned";
  status?: "open" | "closed";
  team?: string;
  label?: string;
  channel?: "webchat" | "whatsapp";
}

const pickOne = <T extends string>(value: unknown, allowed: readonly T[]) =>
  allowed.includes(value as T) ? (value as T) : undefined;
const text = (value: unknown) => (typeof value === "string" && value ? value.slice(0, 64) : undefined);

export const Route = createFileRoute("/inbox/")({
  validateSearch: (search: Record<string, unknown>): InboxSearch => ({
    view: pickOne(search.view, ["mine", "unassigned"] as const),
    status: pickOne(search.status, ["open", "closed"] as const),
    team: text(search.team),
    label: text(search.label),
    channel: pickOne(search.channel, ["webchat", "whatsapp"] as const),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    getInbox({
      data: {
        view: deps.view ?? "all",
        status: deps.status,
        teamId: deps.team,
        labelId: deps.label,
        channel: deps.channel,
      },
    }),
  head: () => ({ meta: [{ title: "Inbox · Customer Inbox" }] }),
  component: Inbox,
});

const ANY = "any";

function Inbox() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/inbox/" });
  const router = useRouter();
  useLive("/live/inbox", () => void router.invalidate());

  const setSearch = (change: Partial<InboxSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });
  const filtered = Boolean(search.view || search.status || search.team || search.label || search.channel);

  return (
    <AppShell wide>
      <PageHeader title="Inbox" />
      <div className="space-y-4">
        <Tabs
          value={search.view ?? "all"}
          onValueChange={(value) => setSearch({ view: value === "all" ? undefined : (value as InboxSearch["view"]) })}
        >
          <TabsList>
            <TabsTrigger value="mine">Mine</TabsTrigger>
            <TabsTrigger value="unassigned">Unassigned</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2">
          <SimpleSelect
            label="Status"
            value={search.status ?? ANY}
            options={[
              { value: ANY, label: "Any status" },
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
            ]}
            onChange={(v) => setSearch({ status: v === ANY ? undefined : (v as InboxSearch["status"]) })}
          />
          <SimpleSelect
            label="Team"
            value={search.team ?? ANY}
            options={[{ value: ANY, label: "Any team" }, ...data.teams.map((t) => ({ value: t.id, label: t.name }))]}
            onChange={(v) => setSearch({ team: v === ANY ? undefined : v })}
          />
          <SimpleSelect
            label="Label"
            value={search.label ?? ANY}
            options={[{ value: ANY, label: "Any label" }, ...data.labels.map((l) => ({ value: l.id, label: l.name }))]}
            onChange={(v) => setSearch({ label: v === ANY ? undefined : v })}
          />
          <SimpleSelect
            label="Channel"
            value={search.channel ?? ANY}
            options={[
              { value: ANY, label: "All channels" },
              { value: "webchat", label: "Webchat" },
              ...(data.whatsapp ? [{ value: "whatsapp", label: "WhatsApp" }] : []),
            ]}
            onChange={(v) => setSearch({ channel: v === ANY ? undefined : (v as InboxSearch["channel"]) })}
          />
        </div>
        {data.rows.length === 0 ? (
          filtered ? (
            <EmptyState kind="filtered" title="No conversations match these filters" />
          ) : (
            <EmptyState
              title="No conversations yet"
              description="Chats from your website widgets will appear here."
              action={
                <Link to="/settings/channels" className="text-sm text-primary hover:underline">
                  Set up a chat widget
                </Link>
              }
            />
          )
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            {data.rows.map((row) => (
              <li key={row.id}>
                <Link
                  to="/inbox/$conversationId"
                  params={{ conversationId: row.id }}
                  data-testid="conversation-row"
                  className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 truncate font-medium">{row.contactName}</span>
                    <Badge variant="outline">{CHANNEL_LABELS[row.channel] ?? row.channel}</Badge>
                    <Badge variant={row.status === "open" ? "default" : "secondary"}>
                      {row.status === "open" ? "Open" : "Closed"}
                    </Badge>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{shortTime(row.lastMessageAt)}</span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{row.preview}</p>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>{row.assignee ?? "Unassigned"}</span>
                    <span>{row.teamName ?? "No team"}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
