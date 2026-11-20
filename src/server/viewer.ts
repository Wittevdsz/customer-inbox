import { eq } from "drizzle-orm";
import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { db } from "@/db";
import { teamMembers, users } from "@/db/schema";

/** The signed-in member as the app's rules see them. */
export interface Viewer {
  id: string;
  email: string;
  admin: boolean;
  teamIds: string[];
}

export class NotAllowedError extends Error {
  constructor(message = "Only admins can do that.") {
    super(message);
  }
}

/** Records the member on first sight (email from the identity) and loads their teams. */
export async function viewerFor(user: EveryAppUser): Promise<Viewer> {
  const [, memberships] = await db.batch([
    db
      .insert(users)
      .values({ id: user.id, email: user.email, createdAt: Date.now() })
      .onConflictDoUpdate({ target: users.id, set: { email: user.email } }),
    db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, user.id)),
  ]);
  return {
    id: user.id,
    email: user.email,
    admin: isAdmin(user),
    teamIds: memberships.map((m) => m.teamId),
  };
}

export function requireAdmin(viewer: Viewer): void {
  if (!viewer.admin) throw new NotAllowedError();
}
