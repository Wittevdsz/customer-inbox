import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { pick, open, createTeam, addTeamMember, createWidget, startChat, visitorHeaders, whatsappBindings, whatsappPayload, sign, WHATSAPP } from './helpers.mjs';

const runtime = await startRuntime({ bindings: whatsappBindings(true) });
try {
  const owner = await (await runtime.context('owner')).newPage();
  const member = await (await runtime.context('member')).newPage();

  // Both people open the app once, so each is known to it.
  await open(member, '/inbox');
  await expect(member.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await open(owner, '/');
  await expect(owner).toHaveURL(/\/inbox/);

  // F006: teams and members.
  await createTeam(owner, 'Support');
  await createTeam(owner, 'Billing');
  await addTeamMember(owner, 'Support', 'member@example.test');
  await addTeamMember(owner, 'Billing', 'owner@example.test');

  // F004: labels and custom fields an admin defines.
  await open(owner, '/settings/contacts');
  for (const name of ['VIP', 'Invoices']) {
    await owner.locator('#label-name').fill(name);
    await owner.getByRole('button', { name: 'Add label' }).click();
    await expect(owner.getByTestId('label-row').filter({ hasText: name })).toBeVisible();
  }
  await owner.locator('#field-name').fill('Plan');
  await pick(owner, 'Field type', 'Choice');
  await owner.locator('#field-options').fill('Basic, Pro, Enterprise');
  await owner.getByRole('button', { name: 'Add field' }).click();
  await expect(owner.getByTestId('field-row').filter({ hasText: 'Plan' })).toBeVisible();
  await owner.locator('#field-name').fill('Renewal date');
  await pick(owner, 'Field type', 'Date');
  await owner.getByRole('button', { name: 'Add field' }).click();
  await expect(owner.getByTestId('field-row').filter({ hasText: 'Renewal date' })).toBeVisible();
  // Rename a label.
  const vip = owner.getByTestId('label-row').filter({ hasText: 'VIP' });
  await vip.getByRole('button', { name: 'Rename' }).click();
  const editing = owner.getByTestId('label-row').filter({ has: owner.getByLabel('Label name') });
  await editing.getByLabel('Label name').fill('Priority');
  await editing.getByRole('button', { name: 'Save' }).click();
  await expect(owner.getByTestId('label-row').filter({ hasText: 'Priority' })).toBeVisible();

  // F006: an ordered routing rule.
  await open(owner, '/settings/team');
  await owner.locator('#rule-keyword').fill('invoice');
  await pick(owner, 'Rule team', 'Billing');
  await pick(owner, 'Rule label', 'Invoices');
  await owner.getByRole('button', { name: 'Add rule' }).click();
  await expect(owner.getByTestId('rule-row').filter({ hasText: 'invoice' })).toBeVisible();

  // F002: a widget with an embed snippet on the app's own host.
  const chatUrl = await createWidget(owner, 'Website', 'Hi there! Ask us anything about your order.', 'Support');
  expect(new URL(chatUrl).hostname).toBe(runtime.hostname);
  const key = new URL(chatUrl).pathname.split('/')[2];
  await expect(owner.getByTestId('widget-row').getByTestId('widget-snippet')).toContainText(chatUrl);

  // A visitor opens the public chat page without signing in.
  const visitorContext = await runtime.context(null);
  const visitor = await visitorContext.newPage();
  visitor.on('pageerror', (e) => console.log('visitor page error:', e.message));
  await visitor.goto(new URL(chatUrl).pathname);
  await expect(visitor.getByText('Hi there! Ask us anything about your order.')).toBeVisible();
  await visitor.locator('#visitor-name').fill('Maya Lindqvist');
  await visitor.locator('#visitor-email').fill('maya@lindqvist.example');
  await visitor.locator('#visitor-message').fill("Hello, I can't find my order confirmation.");
  await visitor.getByRole('button', { name: 'Start chat' }).click();
  await expect(visitor.getByTestId('visitor-message').filter({ hasText: "can't find my order confirmation" })).toBeVisible();

  // F001: the member sees it in the inbox, from webchat, in the widget's default team.
  await open(member, '/inbox');
  const mayaRow = member.getByTestId('conversation-row').filter({ hasText: 'Maya Lindqvist' });
  await expect(mayaRow).toContainText('Webchat');
  await expect(mayaRow).toContainText('Support');
  await expect(mayaRow).toContainText('Open');
  await expect(mayaRow).toContainText("can't find my order confirmation");
  await mayaRow.click();
  await expect(member.getByTestId('contact-panel')).toContainText('maya@lindqvist.example');
  await expect(member.getByTestId('thread')).toContainText("can't find my order confirmation");

  // Realtime both ways.
  await member.getByLabel('Message', { exact: true }).fill('Hi Maya, let me look that up for you.');
  await member.getByRole('button', { name: 'Send' }).click();
  await expect(visitor.getByTestId('visitor-message').filter({ hasText: 'let me look that up' })).toBeVisible();
  await visitor.getByLabel('Message', { exact: true }).fill('Thanks! It was order 4821.');
  await visitor.getByRole('button', { name: 'Send' }).click();
  await expect(member.getByTestId('message').filter({ hasText: 'order 4821' })).toBeVisible();
  // Thread in time order.
  const texts = await member.getByTestId('message').allInnerTexts();
  const at = (s) => texts.findIndex((t) => t.includes(s));
  expect(at("can't find")).toBeLessThan(at('look that up'));
  expect(at('look that up')).toBeLessThan(at('order 4821'));

  // F003: an internal note is distinct and never reaches the visitor.
  await member.getByRole('tab', { name: 'Internal note' }).click();
  await member.getByLabel('Message', { exact: true }).fill('Order 4821 shipped late, offer a discount.');
  await member.getByRole('button', { name: 'Add note' }).click();
  await expect(member.locator('[data-testid="message"][data-kind="note"]').filter({ hasText: 'offer a discount' })).toBeVisible();
  await member.getByRole('tab', { name: 'Reply' }).click();

  // F003: assign to a teammate and transfer between teams, each logged.
  await pick(member, 'Assignee', 'member@example.test');
  await expect(member.locator('[data-testid="message"][data-kind="event"]').filter({ hasText: 'member@example.test' })).toBeVisible();
  await pick(member, 'Team', 'Billing');
  await expect(member.locator('[data-testid="message"][data-kind="event"]').filter({ hasText: 'Billing' })).toBeVisible();
  await pick(member, 'Team', 'Support');

  // F005: shared and personal quick replies, inserted with '/' and the picker.
  await open(owner, '/settings/quick-replies');
  await owner.getByRole('button', { name: 'New quick reply' }).click();
  await owner.locator('#qr-title').fill('Shipping times');
  await owner.locator('#qr-shortcut').fill('shipping');
  await owner.locator('#qr-body').fill('Orders ship within 2 business days.');
  await pick(owner, 'Visible to', 'Everyone');
  await owner.getByRole('button', { name: 'Save quick reply' }).click();
  await expect(owner.getByTestId('qr-row').filter({ hasText: 'Shipping times' })).toContainText('Everyone');

  await open(member, '/settings/quick-replies');
  await member.getByRole('button', { name: 'New quick reply' }).click();
  await member.locator('#qr-title').fill('Sign-off');
  await member.locator('#qr-shortcut').fill('bye');
  await member.locator('#qr-body').fill('Have a great day!');
  await member.getByRole('button', { name: 'Save quick reply' }).click();
  await expect(member.getByTestId('qr-row').filter({ hasText: 'Sign-off' })).toContainText('Only me');
  await expect(member.getByTestId('qr-row').filter({ hasText: 'Shipping times' })).toBeVisible();

  await open(member, '/inbox');
  await member.getByTestId('conversation-row').filter({ hasText: 'Maya Lindqvist' }).click();
  const composer = member.getByLabel('Message', { exact: true });
  await composer.fill('/ship');
  await member.getByTestId('quick-reply-suggestions').getByRole('button', { name: /Shipping times/ }).click();
  await expect(composer).toHaveValue('Orders ship within 2 business days.');
  await composer.fill('Orders ship within 2 business days. Yours left today.');
  await member.getByRole('button', { name: 'Send' }).click();
  await expect(visitor.getByTestId('visitor-message').filter({ hasText: 'Yours left today' })).toBeVisible();
  await member.getByRole('button', { name: 'Quick replies' }).click();
  await member.getByRole('menuitem', { name: /Sign-off/ }).click();
  await expect(composer).toHaveValue('Have a great day!');
  await member.getByRole('button', { name: 'Send' }).click();
  await expect(member.getByTestId('message').filter({ hasText: 'Have a great day!' })).toBeVisible();

  // F001: close, then a new inbound message reopens it; reopen by hand too.
  await member.getByRole('button', { name: 'Close conversation' }).click();
  await expect(member.getByTestId('conversation-status')).toHaveText('Closed');
  await visitor.getByLabel('Message', { exact: true }).fill('One more thing: can I change the address?');
  await visitor.getByRole('button', { name: 'Send' }).click();
  await expect(member.getByTestId('message').filter({ hasText: 'change the address' })).toBeVisible();
  await expect(member.getByTestId('conversation-status')).toHaveText('Open');
  await member.getByRole('button', { name: 'Close conversation' }).click();
  await expect(member.getByTestId('conversation-status')).toHaveText('Closed');
  await member.getByRole('button', { name: 'Reopen' }).click();
  await expect(member.getByTestId('conversation-status')).toHaveText('Open');

  // F002: a returning visitor in the same browser sees the earlier thread, never the note.
  await visitor.reload();
  await expect(visitor.getByTestId('visitor-message').filter({ hasText: 'order 4821' })).toBeVisible();
  await expect(visitor.getByTestId('visitor-message').filter({ hasText: 'Have a great day!' })).toBeVisible();
  await expect(visitor.getByText('offer a discount')).toHaveCount(0);

  // F006: routing by keyword sends a new chat to Billing with the label.
  const second = await startChat(runtime, key, 'Jonas Berg', 'Question about my latest invoice, please', 'jonas@berg.example');
  const thread = await runtime.fetch(`/chat/${key}/messages`, { headers: visitorHeaders(second) });
  expect(thread.status).toBe(200);
  expect(await thread.text()).toContain('latest invoice');

  await open(owner, '/inbox');
  const jonasRow = owner.getByTestId('conversation-row').filter({ hasText: 'Jonas Berg' });
  await expect(jonasRow).toContainText('Billing');
  // Latest activity first.
  await expect(owner.getByTestId('conversation-row').first()).toContainText('Jonas Berg');
  // F001 filters.
  await pick(owner, 'Label', 'Invoices');
  await expect(jonasRow).toBeVisible();
  await expect(owner.getByTestId('conversation-row').filter({ hasText: 'Maya Lindqvist' })).toHaveCount(0);
  await pick(owner, 'Label', 'Any label');
  await owner.getByRole('tab', { name: 'Unassigned' }).click();
  await expect(jonasRow).toBeVisible();
  await expect(owner.getByTestId('conversation-row').filter({ hasText: 'Maya Lindqvist' })).toHaveCount(0);
  await owner.getByRole('tab', { name: 'All' }).click();
  await pick(owner, 'Team', 'Support');
  await expect(owner.getByTestId('conversation-row').filter({ hasText: 'Maya Lindqvist' })).toBeVisible();
  await expect(jonasRow).toHaveCount(0);
  await pick(owner, 'Team', 'Any team');
  await pick(owner, 'Status', 'Closed');
  await expect(owner.getByTestId('conversation-row')).toHaveCount(0);
  await pick(owner, 'Status', 'Any status');

  await open(member, '/inbox');
  await member.getByRole('tab', { name: 'Mine' }).click();
  await expect(member.getByTestId('conversation-row').filter({ hasText: 'Maya Lindqvist' })).toBeVisible();
  await expect(member.getByTestId('conversation-row')).toHaveCount(1);

  // F004: contacts, search, labels, profile and custom fields.
  await open(member, '/contacts');
  await member.getByLabel('Search contacts').fill('maya');
  await expect(member.getByTestId('contact-row')).toHaveCount(1);
  await member.getByTestId('contact-row').filter({ hasText: 'Maya Lindqvist' }).getByRole('link').first().click();
  await member.locator('#contact-phone').fill('+46 70 123 45 67');
  await pick(member, 'Plan', 'Pro');
  await member.getByLabel('Renewal date').fill('2027-03-01');
  await member.getByRole('button', { name: 'Save contact' }).click();
  await expect(member.getByText('Contact saved')).toBeVisible();
  await member.getByTestId('label-toggle').filter({ hasText: 'Priority' }).click();
  await expect(member.getByTestId('label-toggle').filter({ hasText: 'Priority' })).toHaveAttribute('aria-pressed', 'true');
  await expect(member.getByTestId('contact-conversation')).toHaveCount(1);
  await member.reload();
  await expect(member.locator('#contact-phone')).toHaveValue('+46 70 123 45 67');
  await expect(member.getByLabel('Renewal date')).toHaveValue('2027-03-01');
  await expect(member.getByLabel('Plan')).toContainText('Pro');
  await open(member, '/contacts');
  await pick(member, 'Label', 'Priority');
  await expect(member.getByTestId('contact-row')).toHaveCount(1);
  await expect(member.getByTestId('contact-row')).toContainText('Maya Lindqvist');

  // F008: signed WhatsApp webhook, routing, and a reply on that channel.
  const challenge = await runtime.fetch(`/hooks/whatsapp?hub.mode=subscribe&hub.verify_token=${WHATSAPP.WHATSAPP_VERIFY_TOKEN}&hub.challenge=4242`);
  expect(challenge.status).toBe(200);
  expect(await challenge.text()).toBe('4242');
  expect((await runtime.fetch('/hooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1')).status).toBe(403);
  const body = whatsappPayload('31612345678', 'Sanne de Vries', 'Can I pay my invoice in two parts?', 'wamid.1');
  expect((await runtime.fetch('/hooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body, 'wrong') }, body })).status).toBe(401);
  const accepted = await runtime.fetch('/hooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) }, body });
  expect(accepted.status).toBe(200);
  const followUp = whatsappPayload('31612345678', 'Sanne de Vries', 'Or should I call?', 'wamid.2');
  expect((await runtime.fetch('/hooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(followUp) }, body: followUp })).status).toBe(200);
  await open(owner, '/inbox');
  await pick(owner, 'Channel', 'WhatsApp');
  const sanne = owner.getByTestId('conversation-row').filter({ hasText: 'Sanne de Vries' });
  await expect(owner.getByTestId('conversation-row')).toHaveCount(1);
  await expect(sanne).toContainText('Billing');
  await sanne.click();
  await expect(owner.getByTestId('message')).toHaveCount(2);
  await expect(owner.getByTestId('contact-panel')).toContainText('31612345678');
  await owner.getByLabel('Message', { exact: true }).fill('Yes, we can split it into two payments.');
  await owner.getByRole('button', { name: 'Send' }).click();
  await expect(owner.getByTestId('message').filter({ hasText: 'split it into two' })).toBeVisible();
  await open(owner, '/settings/channels');
  await expect(owner.getByTestId('whatsapp-webhook')).toContainText(`${runtime.hostname}/hooks/whatsapp`);

  // F007: analytics.
  await open(owner, '/analytics');
  await expect(owner.getByTestId('stat-new')).toHaveText('3');
  await expect(owner.getByTestId('stat-sent')).toHaveText('4');
  await expect(owner.getByTestId('stat-frt')).not.toContainText('—');
  await expect(owner.getByTestId('by-agent')).toContainText('member@example.test');
  await expect(owner.getByTestId('by-channel')).toContainText('WhatsApp');
  await expect(owner.getByTestId('by-team')).toContainText('Billing');
  await expect(owner.getByTestId('daily-chart')).toBeVisible();
  await pick(owner, 'Channel', 'Webchat');
  await expect(owner.getByTestId('stat-new')).toHaveText('2');
  await pick(owner, 'Channel', 'All channels');
  await pick(owner, 'Agent', 'member@example.test');
  await expect(owner.getByTestId('stat-new')).toHaveText('1');
  // An agent counts only what they can see: the member isn't in Billing.
  await open(member, '/analytics');
  await expect(member.getByTestId('stat-new')).toHaveText('1');

  // Phone-sized smoke.
  const phone = await (await runtime.context('member', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await open(phone, '/inbox');
  await expect(phone.getByTestId('conversation-row').filter({ hasText: 'Maya Lindqvist' })).toBeVisible();
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // The journey ends on the thread, with the conversation on screen.
  await open(owner, '/inbox');
  await runtime.assertBackLink(owner);
  await owner.getByTestId('conversation-row').filter({ hasText: 'Maya Lindqvist' }).click();
  await expect(owner.getByTestId('message').filter({ hasText: 'It was order 4821' })).toBeVisible();
  await runtime.screenshot(owner);
} finally {
  await runtime.close();
}
