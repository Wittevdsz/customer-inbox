# Customer Inbox

A shared inbox where your team answers customers from a website chat widget and, optionally, WhatsApp. Conversations are routed to teams, assigned, noted on and reported on.

Inspired by https://saysimple.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Work every conversation in one list, filtered by mine, unassigned, status, team, label and channel, and reply, close or reopen.
- Add a chat widget to your website; visitors chat live without signing in and see their own thread when they return.
- Assign or transfer a conversation to a teammate or team, and leave internal notes customers never see.
- Keep contacts with labels and admin-defined custom fields, and see each contact's conversations.
- Save shared and personal quick replies and insert them with `/` or a picker.
- Set up teams and ordered keyword routing rules; agents see only their teams' conversations.
- Report new, closed and open conversations, replies sent and median first response time by agent, team and channel.
- Connect your own WhatsApp Cloud API number to receive and answer WhatsApp messages.

Left out: accounts and sign-in, which your Gateway handles; Messenger, Instagram and email channels; AI agents and flow automation; broadcasts; the developer API and integrations; contact import; billing.

## Setup

- Install: `pnpm install`.
- Run locally: `pnpm dev`.
- Test: `pnpm test` for unit tests; `checks/` holds the release suites.
- Deploy: `pnpm run deploy` to your EveryApp Gateway. Everyone in the organization can open the app; owners and admins manage settings.
- No secrets or settings are needed for the inbox, chat widgets, contacts, quick replies, routing and reports.
- WhatsApp (optional, off until all four are set):
  - `WHATSAPP_ACCESS_TOKEN`: a Meta system user token with `whatsapp_business_messaging`, used to send replies.
  - `WHATSAPP_APP_SECRET`: your Meta app's secret, used to check webhook signatures.
  - `WHATSAPP_VERIFY_TOKEN`: generated for you; paste it into Meta's webhook settings.
  - `WHATSAPP_PHONE_NUMBER_ID`: the phone number ID replies are sent from.
  - Point Meta's webhook at `https://<your app>/hooks/whatsapp` and subscribe to `messages`.

## Limitations

- Chat widgets are a link or button that opens the chat page in a new tab, not an in-page bubble.
- WhatsApp replies are text only, and Meta delivers them only within 24 hours of the customer's last message; others show as "Not delivered". Incoming media shows as a placeholder. Sending to real WhatsApp numbers was not tested locally.
- Teammates appear for assignment once they've opened the app, or when the Gateway lists its members.
