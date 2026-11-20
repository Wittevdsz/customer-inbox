import { createFileRoute } from "@tanstack/react-router";
import { serveStart } from "@/server/webchat";

// Public: a visitor starts a conversation and gets its token.
export const Route = createFileRoute("/chat/$key/start")({
  server: { handlers: { POST: ({ params, request }) => serveStart(params.key, request) } },
});
