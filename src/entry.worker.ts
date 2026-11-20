import tanstackEntry from "@tanstack/react-start/server-entry";
import { everyApp, getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { findVisible } from "@/server/conversations";
import { joinRoom } from "@/server/live";
import { viewerFor } from "@/server/viewer";
import { serveVisitorLive } from "@/server/webchat";

export { ConversationRoom } from "@/server/live";

const VISITOR_LIVE = /^\/chat\/([a-z0-9]{1,40})\/live$/;
const MEMBER_LIVE = /^\/live\/(inbox|conversations\/[A-Za-z0-9-]{1,64})$/;

/**
 * WebSockets for live updates, checked here before they reach a room: a
 * visitor with their conversation's token, a member for a conversation
 * they can see or for the inbox.
 */
async function live(request: Request): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const visitor = VISITOR_LIVE.exec(pathname);
  if (visitor) return serveVisitorLive(visitor[1]!, request);
  const member = MEMBER_LIVE.exec(pathname);
  if (!member) return null;
  const user = await getEveryAppUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const viewer = await viewerFor(user);
  let room = "inbox";
  if (member[1] !== "inbox") {
    const conversation = await findVisible(viewer, member[1]!.slice("conversations/".length));
    if (!conversation) return new Response("Not found", { status: 404 });
    room = conversation.id;
  }
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket", { status: 426 });
  }
  return joinRoom(room, request);
}

// everyApp() verifies the identity the Gateway sent before any request reaches
// the app (a request from anywhere else is a 401).
export default everyApp<Env>(async (request) => (await live(request)) ?? tanstackEntry.fetch(request));
