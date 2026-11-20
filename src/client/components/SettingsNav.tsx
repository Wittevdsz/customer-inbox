import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/settings/team", label: "Teams & routing" },
  { to: "/settings/contacts", label: "Labels & fields" },
  { to: "/settings/channels", label: "Channels" },
  { to: "/settings/quick-replies", label: "Quick replies" },
] as const;

/** The settings pages, as a row of links under the page title. */
export function SettingsNav() {
  return (
    <nav className="-mt-4 flex gap-4 overflow-x-auto border-b border-border text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="-mb-px shrink-0 border-b-2 border-transparent pb-2 text-muted-foreground hover:text-foreground"
          activeProps={{ className: "border-primary text-foreground" }}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
