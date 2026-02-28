import { Autonomous, z } from "@botpress/runtime";

const API = "https://api.github.com";

const headers: Record<string, string> = {
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "botpress-changelogger",
};

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
    const res = await fetch(
      `${API}/repos/${owner}/${repo}/releases?per_page=20`,
      { headers }
    );

    if (res.ok) {
      const releases = (await res.json()) as any[];

      if (releases.length > 0) {
        const lines = [`**Releases for ${owner}/${repo}:**\n`];

        for (const r of releases) {
          const date = r.published_at
            ? r.published_at.split("T")[0]
            : "unknown";
          const pre = r.prerelease ? " _(pre-release)_" : "";
          const name =
            r.name && r.name !== r.tag_name ? ` "${r.name}"` : "";
          lines.push(`- **${r.tag_name}**${name} - ${date}${pre}`);
        }

        if (releases.length >= 2) {
          lines.push(
            `\nTo generate a changelog, pick two tags. Example: from \`${releases[1].tag_name}\` to \`${releases[0].tag_name}\`.`
          );
        }

        return lines.join("\n");
      }
    }

    // Fallback to tags API
    const tagsRes = await fetch(
      `${API}/repos/${owner}/${repo}/tags?per_page=20`,
      { headers }
    );

    if (!tagsRes.ok) {
      return `Could not fetch tags for ${owner}/${repo}. Check the repo exists and is public.`;
    }

    const tags = (await tagsRes.json()) as any[];

    if (tags.length === 0) {
      return `No tags or releases found for ${owner}/${repo}. You can still use branch names or commit SHAs.`;
    }

    const lines = [`**Tags for ${owner}/${repo}:**\n`];
    for (const t of tags) {
      lines.push(`- **${t.name}** (${t.commit.sha.slice(0, 7)})`);
    }

    if (tags.length >= 2) {
      lines.push(
        `\nTo generate a changelog, pick two tags. Example: from \`${tags[1].name}\` to \`${tags[0].name}\`.`
      );
    }

    return lines.join("\n");
  },
});
