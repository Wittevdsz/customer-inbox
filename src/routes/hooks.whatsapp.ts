import { createFileRoute } from "@tanstack/react-router";
import { serveWhatsAppHook } from "@/server/whatsapp";

// Public: Meta's webhook. 404 until the WhatsApp feature is set up.
export const Route = createFileRoute("/hooks/whatsapp")({
  server: {
    handlers: {
      GET: ({ request }) => serveWhatsAppHook(request),
      POST: ({ request }) => serveWhatsAppHook(request),
    },
  },
});
