import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Spinner } from "@/client/components/ui/spinner";
import { Textarea } from "@/client/components/ui/textarea";
import { useLive } from "@/client/hooks/useLive";
import { shortTime } from "@/client/lib/format";

// The public chat page a widget links to. It runs in the browser only: the
// visitor's token lives in this browser's localStorage.
export const Route = createFileRoute("/chat/$key/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Chat" }] }),
  component: VisitorChat,
});

interface Session {
  conversationId: string;
  token: string;
}
interface ChatMessage {
  id: string;
  fromVisitor: boolean;
  body: string;
  createdAt: number;
}

function VisitorChat() {
  const { key } = Route.useParams();
  const storageKey = `chat-session:${key}`;
  const [widget, setWidget] = useState<{ name: string; greeting: string } | null | "missing">(null);
  const [session, setSession] = useState<Session | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "null") as Session | null;
    } catch {
      return null;
    }
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/chat/${key}/widget`)
      .then(async (r) => setWidget(r.ok ? ((await r.json()) as { name: string; greeting: string }) : "missing"))
      .catch(() => setWidget("missing"));
  }, [key]);

  const load = useCallback(async () => {
    if (!session) return;
    const response = await fetch(`/chat/${key}/messages`, { headers: headersFor(session) });
    if (response.status === 401) {
      localStorage.removeItem(storageKey);
      setSession(null);
      return;
    }
    if (response.ok) setMessages(((await response.json()) as { messages: ChatMessage[] }).messages);
  }, [key, session, storageKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useLive(
    session ? `/chat/${key}/live?conversation=${encodeURIComponent(session.conversationId)}&token=${encodeURIComponent(session.token)}` : null,
    () => void load(),
  );

  if (widget === null) {
    return (
      <Frame>
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </Frame>
    );
  }
  if (widget === "missing") {
    return (
      <Frame>
        <EmptyState kind="error" title="This chat isn't available" />
      </Frame>
    );
  }

  return (
    <Frame>
      <header className="space-y-1 border-b border-border px-4 py-3">
        <h1 className="font-semibold">{widget.name}</h1>
        {widget.greeting ? <p className="text-sm text-muted-foreground">{widget.greeting}</p> : null}
      </header>
      {session ? (
        <Conversation
          messages={messages}
          error={error}
          onSend={async (body) => {
            setError(null);
            const response = await fetch(`/chat/${key}/messages`, {
              method: "POST",
              headers: { ...headersFor(session), "content-type": "application/json" },
              body: JSON.stringify({ body }),
            });
            if (!response.ok) {
              setError("Your message wasn't sent. Try again.");
              return false;
            }
            setMessages(((await response.json()) as { messages: ChatMessage[] }).messages);
            return true;
          }}
        />
      ) : (
        <StartForm
          error={error}
          onStart={async (input) => {
            setError(null);
            const response = await fetch(`/chat/${key}/start`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input),
            });
            if (!response.ok) {
              setError(response.status === 400 ? "Check your name, email and message." : "The chat couldn't start. Try again.");
              return;
            }
            const started = (await response.json()) as Session;
            localStorage.setItem(storageKey, JSON.stringify(started));
            setSession(started);
          }}
        />
      )}
    </Frame>
  );
}

function headersFor(session: Session) {
  return { "x-conversation-id": session.conversationId, "x-visitor-token": session.token };
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh justify-center bg-background p-0 sm:p-6">
      <div className="flex w-full max-w-lg flex-col overflow-hidden border-border bg-card text-card-foreground sm:rounded-xl sm:border sm:shadow-xs">
        {children}
      </div>
    </div>
  );
}

function StartForm({
  error,
  onStart,
}: {
  error: string | null;
  onStart: (input: { name: string; email: string; message: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !message.trim()) return;
    setPending(true);
    await onStart({ name: name.trim(), email: email.trim(), message: message.trim() });
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="visitor-name">Your name</Label>
        <Input id="visitor-name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="visitor-email">Email (optional)</Label>
        <Input id="visitor-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="visitor-message">Message</Label>
        <Textarea id="visitor-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} required />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" pending={pending} className="w-full">
        Start chat
      </Button>
    </form>
  );
}

function Conversation({
  messages,
  error,
  onSend,
}: {
  messages: ChatMessage[];
  error: string | null;
  onSend: (body: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = text.trim();
    if (!body || pending) return;
    setPending(true);
    if (await onSend(body)) setText("");
    setPending(false);
  }

  return (
    <>
      <ol className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <li key={m.id} data-testid="visitor-message" className={m.fromVisitor ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.fromVisitor
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground"
                  : "max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2"
              }
            >
              <p className="text-sm whitespace-pre-wrap">{m.body}</p>
              <p className={m.fromVisitor ? "text-xs text-primary-foreground/75" : "text-xs text-muted-foreground"}>
                {shortTime(m.createdAt)}
              </p>
            </div>
          </li>
        ))}
        <div ref={end} />
      </ol>
      <form onSubmit={submit} className="space-y-2 border-t border-border p-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex items-end gap-2">
          <Textarea
            aria-label="Message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
          />
          <Button type="submit" pending={pending} disabled={!text.trim()}>
            Send
          </Button>
        </div>
      </form>
    </>
  );
}
