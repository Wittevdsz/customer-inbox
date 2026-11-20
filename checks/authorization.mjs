import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { pick, open, createTeam, addTeamMember, createWidget, startChat, visitorHeaders, whatsappBindings, whatsappPayload, sign } from './helpers.mjs';

// WhatsApp left unset: the channel is off.
const runtime = await startRuntime({ bindings: whatsappBindings(false) });
const count = async (sql) => (await (await runtime.database()).prepare(sql).first()).n;

/** Records the server-function request a click sends, to replay it as someone else. */
async function capture(page, action) {
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/_serverFn/') && r.method() === 'POST'),
    action(),
  ]);
  const headers = Object.fromEntries(Object.entries(await request.allHeaders()).filter(([k]) => k === 'content-type' || k === 'accept' || k.startsWith('x-')));
  return { path: new URL(request.url()).pathname + new URL(request.url()).search, headers, body: request.postData() };
}
const replay = (call, role) => runtime.fetch(call.path, { role, method: 'POST', headers: call.headers, body: call.body });

try {
  await runtime.assertPrivateAccess(['/inbox', '/contacts', '/analytics', '/settings/quick-replies', '/settings/team']);

  // X001: no sign-in page of the app's own; anonymous visitors are refused, not sent to a login form.
  for (const path of ['/login', '/signin', '/sign-in', '/signup', '/auth/login', '/logout']) {
    const res = await runtime.fetch(path, { role: 'owner' });
    expect(res.status, path).toBe(404);
  }
  const anon = await runtime.fetch('/inbox');
  expect([401, 403]).toContain(anon.status);
  expect(await anon.text()).not.toMatch(/type="password"/);

  const owner = await (await runtime.context('owner')).newPage();
  const member = await (await runtime.context('member')).newPage();
  await open(member, '/inbox');
  await open(owner, '/inbox');

  // Admin-only settings: the owner can, a member's replayed call changes nothing.
  await open(owner, '/settings/team');
  const teamCall = await capture(owner, async () => {
    await owner.locator('#team-name').fill('Billing');
    await owner.getByRole('button', { name: 'Add team' }).click();
  });
  await expect(owner.getByTestId('team-row').filter({ hasText: 'Billing' })).toBeVisible();
  expect(await count('select count(*) as n from teams')).toBe(1);
  const refusedTeam = await replay(teamCall, 'member');
  // A refused server function answers with its error, not a result.
  expect(await refusedTeam.text()).toContain('Only admins can do that.');
  expect(await count('select count(*) as n from teams')).toBe(1);
  await open(member, '/settings/team');
  await expect(member.getByRole('button', { name: 'Add team' })).toHaveCount(0);
  await open(member, '/settings/channels');
  await expect(member.getByRole('button', { name: 'New chat widget' })).toHaveCount(0);
  await open(member, '/settings/contacts');
  await expect(member.getByRole('button', { name: 'Add label' })).toHaveCount(0);

  await createTeam(owner, 'Support');
  await addTeamMember(owner, 'Billing', 'owner@example.test');
  await addTeamMember(owner, 'Support', 'member@example.test');
  await open(owner, '/settings/team');
  await owner.locator('#rule-keyword').fill('refund');
  await pick(owner, 'Rule team', 'Billing');
  await owner.getByRole('button', { name: 'Add rule' }).click();
  await expect(owner.getByTestId('rule-row')).toHaveCount(1);

  const chatUrl = await createWidget(owner, 'Help desk', 'Welcome! How can we help?', 'Support');
  const key = new URL(chatUrl).pathname.split('/')[2];

  // Public routes: a bad key or token shows nothing.
  expect((await runtime.fetch('/chat/not-a-real-key/widget')).status).toBe(404);
  const widget = await runtime.fetch(`/chat/${key}/widget`);
  expect(widget.status).toBe(200);
  const widgetJson = await widget.json();
  expect(Object.keys(widgetJson).sort()).toEqual(['greeting', 'name']);

  const a = await startChat(runtime, key, 'Ana Pereira', 'I want a refund for order 77', 'ana@pereira.example');
  const b = await startChat(runtime, key, 'Ben Okafor', 'Where is my parcel?');
  expect((await runtime.fetch(`/chat/${key}/messages`)).status).toBe(401);
  expect((await runtime.fetch(`/chat/${key}/messages`, { headers: { ...visitorHeaders(a), 'x-visitor-token': b.token } })).status).toBe(401);
  expect((await runtime.fetch(`/chat/${key}/messages`, { method: 'POST', headers: { ...visitorHeaders(a), 'x-visitor-token': b.token, 'content-type': 'application/json' }, body: JSON.stringify({ body: 'spoofed' }) })).status).toBe(401);
  expect(await count("select count(*) as n from messages where body = 'spoofed'")).toBe(0);
  expect((await runtime.fetch(`/chat/${key}/live?conversation=${a.conversationId}&token=${b.token}`)).status).toBe(401);

  // Ana's conversation was routed to Billing; the member isn't in Billing.
  await open(member, '/inbox');
  await expect(member.getByTestId('conversation-row').filter({ hasText: 'Ben Okafor' })).toBeVisible();
  await expect(member.getByTestId('conversation-row').filter({ hasText: 'Ana Pereira' })).toHaveCount(0);
  await member.goto(`/inbox/${a.conversationId}`);
  await expect(member.getByText('Conversation not found')).toBeVisible();
  await expect(member.getByText('refund for order 77')).toHaveCount(0);
  await open(member, '/contacts');
  await expect(member.getByTestId('contact-row').filter({ hasText: 'Ana Pereira' })).toHaveCount(0);
  await open(member, '/analytics');
  await expect(member.getByTestId('stat-new')).toHaveText('1');

  // The owner (admin) sees everything, replies and leaves a note.
  await open(owner, '/inbox');
  await owner.getByTestId('conversation-row').filter({ hasText: 'Ana Pereira' }).click();
  const replyCall = await capture(owner, async () => {
    await owner.getByLabel('Message', { exact: true }).fill('Your refund is on its way.');
    await owner.getByRole('button', { name: 'Send' }).click();
  });
  await expect(owner.getByTestId('message').filter({ hasText: 'refund is on its way' })).toBeVisible();
  await owner.getByRole('tab', { name: 'Internal note' }).click();
  await owner.getByLabel('Message', { exact: true }).fill('Approved by finance lead.');
  await owner.getByRole('button', { name: 'Add note' }).click();
  await expect(owner.locator('[data-testid="message"][data-kind="note"]')).toBeVisible();
  await pick(owner, 'Assignee', 'owner@example.test');
  await expect(owner.locator('[data-testid="message"][data-kind="event"]')).toBeVisible();

  // The member replaying that reply is refused.
  const before = await count('select count(*) as n from messages');
  const refusedReply = await replay(replyCall, 'member');
  expect(await refusedReply.text()).toContain('Conversation not found');
  expect(await count('select count(*) as n from messages')).toBe(before);

  // The visitor sees only their own messages: no notes, events, assignee or team.
  const own = await runtime.fetch(`/chat/${key}/messages`, { headers: visitorHeaders(a) });
  expect(own.status).toBe(200);
  const ownText = await own.text();
  expect(ownText).toContain('refund is on its way');
  expect(ownText).not.toContain('Approved by finance lead');
  expect(ownText).not.toContain('owner@example.test');
  expect(ownText).not.toContain('Billing');
  expect(ownText).not.toContain('parcel');
  const other = await (await runtime.fetch(`/chat/${key}/messages`, { headers: visitorHeaders(b) })).text();
  expect(other).not.toContain('refund');

  // Personal quick replies stay with their owner, even from an admin.
  await open(member, '/settings/quick-replies');
  await member.getByRole('button', { name: 'New quick reply' }).click();
  await member.locator('#qr-title').fill('My greeting');
  await member.locator('#qr-shortcut').fill('hello');
  await member.locator('#qr-body').fill('Hello, this is your agent.');
  await expect(member.getByLabel('Visible to')).toHaveCount(0);
  await member.getByRole('button', { name: 'Save quick reply' }).click();
  await expect(member.getByTestId('qr-row').filter({ hasText: 'My greeting' })).toBeVisible();
  await open(owner, '/settings/quick-replies');
  await expect(owner.getByTestId('qr-row').filter({ hasText: 'My greeting' })).toHaveCount(0);

  // WhatsApp unset: the webhook is closed and the channel is hidden.
  const body = whatsappPayload('31600000000', 'Eve', 'hello', 'wamid.x');
  expect((await runtime.fetch('/hooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) }, body })).status).toBe(404);
  expect((await runtime.fetch('/hooks/whatsapp?hub.mode=subscribe&hub.verify_token=&hub.challenge=1')).status).toBe(404);
  expect(await count("select count(*) as n from conversations where channel = 'whatsapp'")).toBe(0);
  await open(owner, '/inbox');
  await owner.getByLabel('Channel', { exact: true }).click();
  await expect(owner.getByRole('option', { name: 'Webchat' })).toBeVisible();
  await expect(owner.getByRole('option', { name: 'WhatsApp' })).toHaveCount(0);
  await owner.keyboard.press('Escape');
  await open(owner, '/settings/channels');
  await expect(owner.getByTestId('whatsapp-webhook')).toHaveCount(0);
} finally {
  await runtime.close();
}
