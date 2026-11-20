import { createServerFn } from "@tanstack/react-start";
import { report, reportInput } from "@/server/analytics";
import { listPeople } from "@/server/people";
import { listLabels, listTeams } from "@/server/settings";
import { whatsappConfig } from "@/server/whatsapp";
import { viewerMiddleware } from "@/serverFunctions/middleware";

export const getReport = createServerFn()
  .middleware([viewerMiddleware])
  .validator((data: unknown) => reportInput.parse(data ?? {}))
  .handler(async ({ data, context: { viewer } }) => {
    const [figures, teams, people, labels] = await Promise.all([
      report(viewer, data),
      listTeams(),
      listPeople(),
      listLabels(),
    ]);
    return {
      figures,
      teams: teams.map((t) => ({ id: t.id, name: t.name })),
      people,
      labels,
      whatsapp: whatsappConfig() !== null,
    };
  });
