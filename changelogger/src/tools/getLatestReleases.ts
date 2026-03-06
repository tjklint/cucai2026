import { Autonomous, z, context } from "@botpress/runtime";

const GITHUB_API = "https://api.github.com";

export const getLatestReleases = new Autonomous.Tool({
  name: "getLatestReleases",
  description:
    "Fetch the latest releases from a GitHub repository. Returns release tag names and dates to determine the changelog range.",

  input: z.object({
    owner: z.string().describe("GitHub repository owner"),
    repo: z.string().describe("GitHub repository name"),
  }),

  output: z.string(),

  handler: async ({ owner, repo }) => {
    try {
      const { githubToken } = context.get("configuration");

      const res = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/releases?per_page=10`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            Authorization: `Bearer ${githubToken}`,
            "User-Agent": "botpress-changelogger",
          },
        }
      );

      if (!res.ok) {
        return `Could not fetch releases for ${owner}/${repo} (status ${res.status}).`;
      }

      const releases = (await res.json()) as Array<{
        tag_name: string;
        name: string;
        published_at: string;
        prerelease: boolean;
      }>;

      if (releases.length < 2) {
        return `Found ${releases.length} release(s). Need at least 2 to generate a changelog.`;
      }

      const lines = [`Releases for ${owner}/${repo}:\n`];
      for (const r of releases.slice(0, 5)) {
        const date = r.published_at?.split("T")[0] ?? "unknown";
        const pre = r.prerelease ? " (pre-release)" : "";
        lines.push(`- ${r.tag_name} - ${date}${pre}`);
      }

      lines.push(
        `\nLatest: ${releases[0].tag_name}, Previous: ${releases[1].tag_name}`
      );
      return lines.join("\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error fetching releases: ${message}`;
    }
  },
});
