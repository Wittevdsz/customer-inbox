import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/inbox", label: "Inbox" },
  { to: "/contacts", label: "Contacts" },
  { to: "/analytics", label: "Analytics" },
  { to: "/settings", label: "Settings" },
] as const;

/** The app's sections, beside the way back to the Gateway. */
export function AppNav() {
  return (
    <nav className="flex min-w-0 items-center gap-3 overflow-x-auto text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          activeProps={{ className: "font-medium text-foreground" }}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
