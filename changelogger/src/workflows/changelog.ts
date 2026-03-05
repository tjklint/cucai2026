import { Workflow, z } from "@botpress/runtime";
import { getLatestReleases } from "../tools/getLatestReleases";
import { generateChangelog } from "../tools/generateChangelog";
import { publishChangelog } from "../tools/publishChangelog";

export default new Workflow({
  name: "changelog",
  description: "Generate a changelog from GitHub releases and publish to Notion",

  input: z.object({
    owner: z.string().describe("GitHub repository owner"),
    repo: z.string().describe("GitHub repository name"),
  }),

  output: z.object({
    success: z.boolean(),
    message: z.string(),
  }),

  handler: async ({ input, execute }) => {
    const result = await execute({
      instructions: `A pull request was merged in ${input.owner}/${input.repo}.

Your task:
1. Call getLatestReleases for ${input.owner}/${input.repo} to check for releases
2. If there are at least 2 releases, call generateChangelog with the latest tag as toRef and the previous tag as fromRef
3. Call publishChangelog with the generated markdown
4. If there are fewer than 2 releases, stop - there is nothing to generate yet`,
      tools: [getLatestReleases, generateChangelog, publishChangelog],
    });

    return { success: true, message: "Changelog workflow completed" };
  },
});
