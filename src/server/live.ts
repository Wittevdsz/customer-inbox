import { DurableObject, env } from "cloudflare:workers";

/**
 * One instance per conversation (named by its id), plus one named "inbox"
 * for the inbox list. It holds the open WebSockets of the visitor and the
 * agents and tells them when something changed; they then read the change
 * through their own authorized routes. Nothing is stored here.
 */
export class ConversationRoom extends DurableObject {
  async fetch(): Promise<Response> {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async notify(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send("changed");
      } catch {
        // A socket that already closed.
      }
    }
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === "ping") socket.send("pong");
  }

  async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    try {
      socket.close(code === 1005 ? 1000 : code);
    } catch {
      // Already closed.
    }
  }
}

/** Tells everyone watching a conversation, and the inbox list, that it changed. */
export async function notifyChange(conversationId: string): Promise<void> {
  await Promise.all(
    [conversationId, "inbox"].map(async (name) => {
      try {
        await env.ROOMS.get(env.ROOMS.idFromName(name)).notify();
      } catch (error) {
        console.error("notify failed", error);
      }
    }),
  );
}

/** Hands an authorized WebSocket upgrade to the room. */
export function joinRoom(name: string, request: Request): Promise<Response> {
  return env.ROOMS.get(env.ROOMS.idFromName(name)).fetch(request);
}
