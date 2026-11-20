import { createMiddleware } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { viewerFor } from "@/server/viewer";

/** The Gateway's verified member, recorded on first sight, with their admin flag and teams. */
export const viewerMiddleware = createMiddleware({ type: "function" })
  .middleware([ensureUserMiddleware])
  .server(async ({ next, context }) => next({ context: { viewer: await viewerFor(context.user) } }));
