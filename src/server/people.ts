import { env } from "cloudflare:workers";
import { GatewayRefusalError, listMembers } from "@every-app/sdk/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export interface Person {
  id: string;
  label: string;
}

/**
 * Teammates to assign and add to teams: everyone who can open the app
 * (through the Gateway's members list) plus anyone already seen here.
 */
export async function listPeople(): Promise<Person[]> {
  const known = await db.select().from(users).orderBy(asc(users.email));
  const byId = new Map(known.map((u) => [u.id, { id: u.id, label: u.name || u.email }]));
  try {
    const { members } = await listMembers({ env });
    for (const m of members) byId.set(m.id, { id: m.id, label: m.name || m.email });
    if (members.length) {
      await db.batch(
        members.map((m) =>
          db
            .insert(users)
            .values({ id: m.id, email: m.email, name: m.name, createdAt: Date.now() })
            .onConflictDoUpdate({ target: users.id, set: { email: m.email, name: m.name } }),
        ) as [never, ...never[]],
      );
    }
  } catch (error) {
    if (!(error instanceof GatewayRefusalError)) throw error;
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Display names for user ids, from the people the app has seen. */
export async function nameMap(): Promise<Map<string, string>> {
  const known = await db.select().from(users);
  return new Map(known.map((u) => [u.id, u.name || u.email]));
}
