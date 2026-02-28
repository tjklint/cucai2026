import { Autonomous, z, adk, actions } from "@botpress/runtime";

const ReleasesSchema = z.array(
  z.object({
    tagName: z.string().describe("The Git tag name (e.g. v1.0.0)"),
    name: z
      .string()
      .optional()
      .describe("The release title, if different from the tag name"),
    date: z
      .string()
      .optional()
      .describe("Publication date in YYYY-MM-DD format"),
    prerelease: z
      .boolean()
      .default(false)
      .describe("Whether this is a pre-release version"),
  })
);

function getPageContent(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.content === "string") return r.content;
    if (typeof r.markdown === "string") return r.markdown;
    if (typeof r.text === "string") return r.text;
    if (typeof r.body === "string") return r.body;
  }
  return JSON.stringify(result, null, 2);
}

export const listTags = new Autonomous.Tool({
  name: "listTags",
  description:
    "List recent releases and tags for a GitHub repository. Use this to discover available version tags before generating a changelog.",

  input: z.object({
    owner: z
      .string()
      .describe("GitHub repository owner (user or organization)"),
    repo: z.string().describe("GitHub repository name"),
  }),

  output: z.string(),

  handler: async ({ owner, repo }) => {
    const releasesUrl = `https://github.com/${owner}/${repo}/releases`;

    const browseResult = await actions.browser.browsePages({
      urls: [releasesUrl],
      waitFor: 3000,
    });

    const results = (browseResult as any)?.results ?? browseResult;
    const page = Array.isArray(results) ? results[0] : results;
    const content = getPageContent(page);

    if (!content || content.length < 100) {
      // Try the tags page as a fallback
      const tagsUrl = `https://github.com/${owner}/${repo}/tags`;

      const tagsBrowse = await actions.browser.browsePages({
        urls: [tagsUrl],
        waitFor: 3000,
      });

      const tagResults = (tagsBrowse as any)?.results ?? tagsBrowse;
      const tagPage = Array.isArray(tagResults) ? tagResults[0] : tagResults;
      const tagContent = getPageContent(tagPage);

      if (!tagContent || tagContent.length < 100) {
        return `Could not fetch releases or tags for ${owner}/${repo}. Verify the repository exists and is public.`;
      }

      const tags = await adk.zai.extract(tagContent, ReleasesSchema, {
        instructions:
          "Extract all Git tags shown on this GitHub tags page. Include the tag name and date if visible.",
      });

      if (!tags.length) {
        return `No tags found for ${owner}/${repo}. You can still generate a changelog using branch names (e.g. \`main\`) or commit SHAs.`;
      }

      const lines = [`**Tags for ${owner}/${repo}:**\n`];
      for (const t of tags) {
        const date = t.date ? ` (${t.date})` : "";
        lines.push(`- **${t.tagName}**${date}`);
      }
      return lines.join("\n");
    }

    const releases = await adk.zai.extract(content, ReleasesSchema, {
      instructions:
        "Extract all releases shown on this GitHub releases page. Include the tag name, release title, date, and pre-release status.",
    });

    if (!releases.length) {
      return `No releases found for ${owner}/${repo}. You can still generate a changelog using branch names (e.g. \`main\`) or commit SHAs.`;
    }

    const lines = [`**Releases for ${owner}/${repo}:**\n`];

    for (const r of releases) {
      const pre = r.prerelease ? " _(pre-release)_" : "";
      const date = r.date ? ` - ${r.date}` : "";
      const name =
        r.name && r.name !== r.tagName ? ` "${r.name}"` : "";
      lines.push(`- **${r.tagName}**${name}${date}${pre}`);
    }

    if (releases.length >= 2) {
      lines.push(
        `\nTo generate a changelog, pick two of these tags. For example: from \`${releases[1].tagName}\` to \`${releases[0].tagName}\`.`
      );
    }

    return lines.join("\n");
  },
});
