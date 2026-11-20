import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "customer-inbox",
  name: "Customer Inbox",
  description:
    "A shared inbox where your team answers website chats and WhatsApp messages, with contacts, routing and reports.",
  icon: "/icon.svg",
  // Everyone in the organization works the inbox; admins manage its settings.
  access: "everyone",
  resources: {
    d1: ["DB"],
    // One ConversationRoom per conversation (named by its id) and one for
    // the inbox list: it holds open WebSockets for live updates, no data.
    durableObjects: [{ name: "ROOMS", className: "ConversationRoom" }],
  },
  public: [
    // The visitor's chat page, its scripts, and its token-checked routes.
    { path: "/chat/:key", methods: ["GET"] },
    { path: "/chat/:key/widget", methods: ["GET"] },
    { path: "/chat/:key/start", methods: ["POST"] },
    { path: "/chat/:key/messages", methods: ["GET", "POST"] },
    { path: "/chat/:key/live", methods: ["GET"] },
    { path: "/assets/**", methods: ["GET"] },
    { path: "/icon.svg", methods: ["GET"] },
    // Meta's WhatsApp webhook: signed with the app secret, 404 until set up.
    { path: "/hooks/whatsapp", methods: ["GET", "POST"] },
  ],
  capabilities: {
    members: { access: "read", why: "Lists teammates to assign conversations to and add to teams." },
  },
  features: {
    whatsapp: {
      name: "WhatsApp",
      why: "Customers' WhatsApp messages arrive in the inbox and replies go back to them.",
      steps: [
        "Create a Meta app with the WhatsApp product and a business phone number: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
        "Under WhatsApp → Configuration, set the callback URL to {appUrl}/hooks/whatsapp, paste the verify token, and subscribe to the messages field.",
      ],
      settings: [
        {
          name: "WHATSAPP_PHONE_NUMBER_ID",
          how: "WhatsApp → API Setup → Phone number ID",
        },
      ],
      secrets: [
        {
          name: "WHATSAPP_ACCESS_TOKEN",
          how: "A system user's permanent token with whatsapp_business_messaging (Business Settings → System users).",
        },
        { name: "WHATSAPP_APP_SECRET", how: "App settings → Basic → App secret" },
        {
          name: "WHATSAPP_VERIFY_TOKEN",
          generate: true,
          how: "Paste this into WhatsApp → Configuration → Verify token.",
        },
      ],
    },
  },
});
