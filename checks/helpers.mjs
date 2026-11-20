import { createHmac } from 'node:crypto';
import { expect } from '/home/user/oss-new/control/runtime/index.mjs';

export const WHATSAPP = {
  WHATSAPP_ACCESS_TOKEN: 'local-test-access-token',
  WHATSAPP_APP_SECRET: 'local-test-app-secret',
  WHATSAPP_VERIFY_TOKEN: 'local-test-verify-token',
  WHATSAPP_PHONE_NUMBER_ID: '100200300',
};

export function whatsappBindings(on) {
  return Object.fromEntries(Object.entries(WHATSAPP).map(([k, v]) => [k, { type: 'text', value: on ? v : '' }]));
}

export function whatsappPayload(from, name, text, id) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      metadata: { phone_number_id: WHATSAPP.WHATSAPP_PHONE_NUMBER_ID },
      contacts: [{ wa_id: from, profile: { name } }],
      messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
    } }] }],
  });
}

export function sign(body, secret = WHATSAPP.WHATSAPP_APP_SECRET) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

/** Picks an option in a labelled select. */
export async function pick(page, label, option) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Opens a page and waits until it's interactive. */
export async function open(page, path) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

export async function createTeam(page, name) {
  await open(page, '/settings/team');
  await page.locator('#team-name').fill(name);
  await page.getByRole('button', { name: 'Add team' }).click();
  await expect(page.getByTestId('team-row').filter({ hasText: name })).toBeVisible();
}

export async function addTeamMember(page, team, email) {
  const row = page.getByTestId('team-row').filter({ hasText: team });
  await row.getByLabel(`Add member to ${team}`).click();
  await page.getByRole('option', { name: email, exact: true }).click();
  await expect(row.getByTestId('team-member').filter({ hasText: email })).toBeVisible();
}

export async function createWidget(page, name, greeting, team) {
  await open(page, '/settings/channels');
  await page.getByRole('button', { name: 'New chat widget' }).click();
  await page.locator('#widget-name').fill(name);
  await page.locator('#widget-greeting').fill(greeting);
  if (team) await pick(page, 'Default team', team);
  await page.getByRole('button', { name: 'Create widget' }).click();
  const row = page.getByTestId('widget-row').filter({ hasText: name });
  await expect(row).toBeVisible();
  const href = await row.getByTestId('widget-link').getAttribute('href');
  return href;
}

/** Starts a visitor chat through the public routes; returns { conversationId, token }. */
export async function startChat(runtime, key, name, message, email) {
  const res = await runtime.fetch(`/chat/${key}/start`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, message }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

export function visitorHeaders(session) {
  return { 'x-conversation-id': session.conversationId, 'x-visitor-token': session.token };
}
