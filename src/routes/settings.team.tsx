import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Trash2, X } from "lucide-react";
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
  addTeamMember,
  createRule,
  createTeam,
  deleteRule,
  deleteTeam,
  getTeamSettings,
  moveRule,
  removeTeamMember,
} from "@/serverFunctions/settings";

export const Route = createFileRoute("/settings/team")({
  loader: () => getTeamSettings(),
  head: () => ({ meta: [{ title: "Teams & routing · Customer Inbox" }] }),
  component: TeamSettings,
});

const NONE = "none";
const ADD = "add";

function TeamSettings() {
  const data = Route.useLoaderData();
  const { run, pending } = useAction();
  const [teamName, setTeamName] = useState("");
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const [keyword, setKeyword] = useState("");
  const [ruleTeam, setRuleTeam] = useState(NONE);
  const [ruleAgent, setRuleAgent] = useState(NONE);
  const [ruleLabel, setRuleLabel] = useState(NONE);

  const teamName_ = (id: string | null) => data.teams.find((t) => t.id === id)?.name ?? "a deleted team";
  const personName = (id: string | null) => data.people.find((p) => p.id === id)?.label ?? "a former teammate";
  const labelName = (id: string | null) => data.labels.find((l) => l.id === id)?.name ?? "a deleted label";

  async function addTeam(event: FormEvent) {
    event.preventDefault();
    if (!teamName.trim()) return;
    if (await run(() => createTeam({ data: { name: teamName } }))) setTeamName("");
  }

  async function addRule(event: FormEvent) {
    event.preventDefault();
    const ok = await run(() =>
      createRule({
        data: {
          keyword,
          teamId: ruleTeam === NONE ? null : ruleTeam,
          assigneeId: ruleAgent === NONE ? null : ruleAgent,
          labelId: ruleLabel === NONE ? null : ruleLabel,
        },
      }),
    );
    if (ok) {
      setKeyword("");
      setRuleTeam(NONE);
      setRuleAgent(NONE);
      setRuleLabel(NONE);
    }
  }

  return (
    <AppShell>
      <PageHeader title="Settings" />
      <SettingsNav />

      <Section title="Teams" description="Agents see their teams' conversations, ones without a team, and ones assigned to them. Admins see all.">
        {data.admin ? (
          <form onSubmit={addTeam} className="flex gap-2">
            <Input
              id="team-name"
              aria-label="Team name"
              placeholder="Team name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="bg-card"
            />
            <Button type="submit" disabled={pending}>
              Add team
            </Button>
          </form>
        ) : null}
        {data.teams.length === 0 ? (
          <EmptyState title="No teams yet" />
        ) : (
          <ul className={`${PANEL} divide-y divide-border`}>
            {data.teams.map((team) => {
              const others = data.people.filter((p) => !team.members.some((m) => m.id === p.id));
              return (
                <li key={team.id} data-testid="team-row" className="space-y-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{team.name}</span>
                    {data.admin ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${team.name}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setRemoving(team)}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {team.members.length === 0 ? <span className="text-sm text-muted-foreground">No members</span> : null}
                    {team.members.map((m) => (
                      <Badge key={m.id} variant="secondary" data-testid="team-member" className="gap-1">
                        {m.label}
                        {data.admin ? (
                          <button
                            type="button"
                            aria-label={`Remove ${m.label} from ${team.name}`}
                            className="cursor-pointer text-muted-foreground hover:text-foreground"
                            onClick={() => run(() => removeTeamMember({ data: { teamId: team.id, userId: m.id } }))}
                          >
                            <X className="size-3" />
                          </button>
                        ) : null}
                      </Badge>
                    ))}
                    {data.admin && others.length ? (
                      <SimpleSelect
                        label={`Add member to ${team.name}`}
                        className="h-7 min-w-32"
                        value={ADD}
                        options={[{ value: ADD, label: "Add member" }, ...others.map((p) => ({ value: p.id, label: p.label }))]}
                        onChange={(userId) => {
                          if (userId !== ADD) void run(() => addTeamMember({ data: { teamId: team.id, userId } }));
                        }}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title="Routing rules"
        description="When a new conversation's first message contains a keyword, the first matching rule applies. Otherwise it goes to the widget's or channel's default team."
      >
        {data.rules.length === 0 ? (
          <EmptyState title="No routing rules" />
        ) : (
          <ol className={`${PANEL} divide-y divide-border`}>
            {data.rules.map((rule, index) => (
              <li key={rule.id} data-testid="rule-row" className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="text-muted-foreground tabular-nums">{index + 1}.</span>
                <span>
                  Contains <span className="font-medium">“{rule.keyword}”</span>
                </span>
                <span className="text-muted-foreground">→</span>
                {rule.teamId ? <Badge variant="outline">Team: {teamName_(rule.teamId)}</Badge> : null}
                {rule.assigneeId ? <Badge variant="outline">Agent: {personName(rule.assigneeId)}</Badge> : null}
                {rule.labelId ? <Badge variant="outline">Label: {labelName(rule.labelId)}</Badge> : null}
                {data.admin ? (
                  <span className="ml-auto flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() => run(() => moveRule({ data: { id: rule.id, direction: "up" } }))}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Move down"
                      disabled={index === data.rules.length - 1}
                      onClick={() => run(() => moveRule({ data: { id: rule.id, direction: "down" } }))}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete rule"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => run(() => deleteRule({ data: { id: rule.id } }))}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {data.admin ? (
          <form onSubmit={addRule} className={`${PANEL} flex flex-wrap items-center gap-2 p-4`}>
            <Input
              id="rule-keyword"
              aria-label="Keyword"
              placeholder="Keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-40"
            />
            <SimpleSelect
              label="Rule team"
              value={ruleTeam}
              options={[{ value: NONE, label: "No team" }, ...data.teams.map((t) => ({ value: t.id, label: t.name }))]}
              onChange={setRuleTeam}
            />
            <SimpleSelect
              label="Rule agent"
              value={ruleAgent}
              options={[{ value: NONE, label: "No agent" }, ...data.people.map((p) => ({ value: p.id, label: p.label }))]}
              onChange={setRuleAgent}
            />
            <SimpleSelect
              label="Rule label"
              value={ruleLabel}
              options={[{ value: NONE, label: "No label" }, ...data.labels.map((l) => ({ value: l.id, label: l.name }))]}
              onChange={setRuleLabel}
            />
            <Button type="submit" disabled={pending || !keyword.trim()}>
              Add rule
            </Button>
          </form>
        ) : null}
      </Section>

      {removing ? (
        <ConfirmDialog
          title={`Delete ${removing.name}?`}
          confirmLabel="Delete team"
          destructive
          pending={pending}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await run(() => deleteTeam({ data: { id: removing.id } }));
            setRemoving(null);
          }}
        >
          Its conversations stay, without a team.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
