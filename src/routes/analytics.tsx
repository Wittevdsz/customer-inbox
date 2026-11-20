import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { formatDuration } from "@/server/logic";
import { getReport } from "@/serverFunctions/analytics";

interface ReportSearch {
  days?: 1 | 7 | 30 | 90;
  team?: string;
  agent?: string;
  channel?: "webchat" | "whatsapp";
  label?: string;
}

const text = (value: unknown) => (typeof value === "string" && value ? value.slice(0, 64) : undefined);

export const Route = createFileRoute("/analytics")({
  validateSearch: (search: Record<string, unknown>): ReportSearch => ({
    days: [1, 7, 30, 90].includes(Number(search.days)) ? (Number(search.days) as ReportSearch["days"]) : undefined,
    team: text(search.team),
    agent: text(search.agent),
    channel: search.channel === "webchat" || search.channel === "whatsapp" ? search.channel : undefined,
    label: text(search.label),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    getReport({
      data: { days: deps.days ?? 30, teamId: deps.team, agentId: deps.agent, channel: deps.channel, labelId: deps.label },
    }),
  head: () => ({ meta: [{ title: "Analytics · Customer Inbox" }] }),
  component: Analytics,
});

const ANY = "any";

function Analytics() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/analytics" });
  const set = (change: Partial<ReportSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });
  const { totals } = data.figures;
  const peak = Math.max(1, ...data.figures.daily.map((d) => d.conversations));

  return (
    <AppShell wide>
      <PageHeader title="Analytics" />
      <div className="flex flex-wrap gap-2">
        <SimpleSelect
          label="Period"
          value={String(search.days ?? 30)}
          options={[
            { value: "1", label: "Last 24 hours" },
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
            { value: "90", label: "Last 90 days" },
          ]}
          onChange={(v) => set({ days: Number(v) as ReportSearch["days"] })}
        />
        <SimpleSelect
          label="Team"
          value={search.team ?? ANY}
          options={[{ value: ANY, label: "All teams" }, ...data.teams.map((t) => ({ value: t.id, label: t.name }))]}
          onChange={(v) => set({ team: v === ANY ? undefined : v })}
        />
        <SimpleSelect
          label="Agent"
          value={search.agent ?? ANY}
          options={[{ value: ANY, label: "All agents" }, ...data.people.map((p) => ({ value: p.id, label: p.label }))]}
          onChange={(v) => set({ agent: v === ANY ? undefined : v })}
        />
        <SimpleSelect
          label="Channel"
          value={search.channel ?? ANY}
          options={[
            { value: ANY, label: "All channels" },
            { value: "webchat", label: "Webchat" },
            ...(data.whatsapp ? [{ value: "whatsapp", label: "WhatsApp" }] : []),
          ]}
          onChange={(v) => set({ channel: v === ANY ? undefined : (v as ReportSearch["channel"]) })}
        />
        <SimpleSelect
          label="Label"
          value={search.label ?? ANY}
          options={[{ value: ANY, label: "Any label" }, ...data.labels.map((l) => ({ value: l.id, label: l.name }))]}
          onChange={(v) => set({ label: v === ANY ? undefined : v })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat id="stat-new" label="New" value={String(totals.created)} />
        <Stat id="stat-closed" label="Closed" value={String(totals.closed)} />
        <Stat id="stat-open" label="Open now" value={String(totals.open)} />
        <Stat id="stat-sent" label="Replies sent" value={String(totals.sent)} />
        <Stat id="stat-frt" label="Median first response" value={formatDuration(totals.medianFirstResponseMs)} />
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">New conversations per day</h2>
        <div
          data-testid="daily-chart"
          role="img"
          aria-label="New conversations per day"
          className="flex h-40 items-end gap-px rounded-xl border border-border bg-card p-4 shadow-xs"
        >
          {data.figures.daily.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${d.conversations}`}
              className="min-h-px flex-1 rounded-t-sm bg-primary/80"
              style={{ height: `${(d.conversations / peak) * 100}%` }}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Breakdown id="by-agent" title="By agent" rows={data.figures.byAgent} />
        <Breakdown id="by-team" title="By team" rows={data.figures.byTeam} />
        <Breakdown id="by-channel" title="By channel" rows={data.figures.byChannel} />
      </div>
    </AppShell>
  );
}

function Stat({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-xl border border-border bg-card p-4 shadow-xs">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p data-testid={id} className="text-2xl font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function Breakdown({
  id,
  title,
  rows,
}: {
  id: string;
  title: string;
  rows: { key: string; label: string; conversations: number; closed: number; sent: number }[];
}) {
  return (
    <section data-testid={id} className="min-w-0 space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead className="text-right">New</TableHead>
              <TableHead className="text-right">Closed</TableHead>
              <TableHead className="text-right">Replies</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Nothing in this period
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="max-w-40 truncate">{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.conversations}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.closed}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.sent}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
