import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { SimpleSelect } from "@/client/components/SimpleSelect";
import { Badge } from "@/client/components/ui/badge";
import { Input } from "@/client/components/ui/input";
import { getContacts } from "@/serverFunctions/contacts";

interface ContactsSearch {
  q?: string;
  label?: string;
}

export const Route = createFileRoute("/contacts/")({
  validateSearch: (search: Record<string, unknown>): ContactsSearch => ({
    q: typeof search.q === "string" && search.q ? search.q.slice(0, 200) : undefined,
    label: typeof search.label === "string" && search.label ? search.label.slice(0, 64) : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getContacts({ data: { q: deps.q, labelId: deps.label } }),
  head: () => ({ meta: [{ title: "Contacts · Customer Inbox" }] }),
  component: Contacts,
});

const ANY = "any";

function Contacts() {
  const { rows, labels } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/contacts/" });
  const [query, setQuery] = useState(search.q ?? "");

  useEffect(() => {
    const next = query.trim() || undefined;
    if (next === search.q) return;
    const timer = setTimeout(
      () => void navigate({ search: (prev) => ({ ...prev, q: next }), replace: true }),
      250,
    );
    return () => clearTimeout(timer);
  }, [query, search.q, navigate]);

  return (
    <AppShell wide>
      <PageHeader title="Contacts" />
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Search contacts"
          placeholder="Name, email or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs bg-card"
        />
        <SimpleSelect
          label="Label"
          value={search.label ?? ANY}
          options={[{ value: ANY, label: "Any label" }, ...labels.map((l) => ({ value: l.id, label: l.name }))]}
          onChange={(v) => void navigate({ search: (prev) => ({ ...prev, label: v === ANY ? undefined : v }), replace: true })}
        />
      </div>
      {rows.length === 0 ? (
        search.q || search.label ? (
          <EmptyState kind="filtered" title="No contacts match" />
        ) : (
          <EmptyState title="No contacts yet" description="Everyone who writes in becomes a contact." />
        )
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          {rows.map((c) => (
            <li key={c.id} data-testid="contact-row" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <Link
                to="/contacts/$contactId"
                params={{ contactId: c.id }}
                className="min-w-0 truncate font-medium hover:underline"
              >
                {c.name}
              </Link>
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {[c.email, c.phone].filter(Boolean).join(" · ")}
              </span>
              <span className="ml-auto flex flex-wrap gap-1">
                {c.labels.map((l) => (
                  <Badge key={l} variant="secondary">
                    {l}
                  </Badge>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
