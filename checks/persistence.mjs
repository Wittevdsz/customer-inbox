import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { open, createTeam, createWidget, startChat, visitorHeaders, whatsappBindings } from './helpers.mjs';

const runtime = await startRuntime({ bindings: whatsappBindings(false) });
try {
  let owner = await (await runtime.context('owner')).newPage();
  await createTeam(owner, 'Support');
  const chatUrl = await createWidget(owner, 'Storefront', 'Hello from the shop team.', 'Support');
  const key = new URL(chatUrl).pathname.split('/')[2];
  const chat = await startChat(runtime, key, 'Priya Nair', 'Is the blue jacket back in stock?', 'priya@nair.example');
  await owner.goto(`/inbox/${chat.conversationId}`);
  await owner.waitForLoadState('networkidle');
  await owner.getByLabel('Message', { exact: true }).fill('It is, in all sizes.');
  await owner.getByRole('button', { name: 'Send' }).click();
  await expect(owner.getByTestId('message').filter({ hasText: 'in all sizes' })).toBeVisible();

  await runtime.restart();

  owner = await (await runtime.context('owner')).newPage();
  await open(owner, '/inbox');
  await expect(owner.getByTestId('conversation-row').filter({ hasText: 'Priya Nair' })).toContainText('Support');
  await owner.getByTestId('conversation-row').filter({ hasText: 'Priya Nair' }).click();
  await expect(owner.getByTestId('message').filter({ hasText: 'in all sizes' })).toBeVisible();
  const thread = await runtime.fetch(`/chat/${key}/messages`, { headers: visitorHeaders(chat) });
  expect(thread.status).toBe(200);
  expect(await thread.text()).toContain('in all sizes');
  await open(owner, '/settings/channels');
  await expect(owner.getByTestId('widget-row').filter({ hasText: 'Storefront' })).toBeVisible();
} finally {
  await runtime.close();
}
