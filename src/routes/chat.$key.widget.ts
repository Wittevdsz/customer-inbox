import { createFileRoute } from "@tanstack/react-router";
import { serveWidget } from "@/server/webchat";

// Public: the chat page reads the widget's name and greeting.
export const Route = createFileRoute("/chat/$key/widget")({
  server: { handlers: { GET: ({ params }) => serveWidget(params.key) } },
});
