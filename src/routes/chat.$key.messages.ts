import { createFileRoute } from "@tanstack/react-router";
import { serveMessages } from "@/server/webchat";

// Public: a visitor reads and adds to their own conversation, with its token.
export const Route = createFileRoute("/chat/$key/messages")({
  server: {
    handlers: {
      GET: ({ params, request }) => serveMessages(params.key, request),
      POST: ({ params, request }) => serveMessages(params.key, request),
    },
  },
});
