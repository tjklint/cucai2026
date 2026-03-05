import { Autonomous, z, adk, context } from "@botpress/runtime";

const ChangeEntrySchema = z.object({
  description: z
    .string()
    .describe("A clean, human-readable one-line description of the change"),
  prNumber: z
    .number()
    .optional()
    .describe("The pull request number if referenced"),
  author: z.string().optional().describe("GitHub username of the author"),
});

const ChangelogSchema = z.object({
  breaking: z.array(ChangeEntrySchema).describe("Breaking changes"),
  features: z.array(ChangeEntrySchema).describe("New features"),
  fixes: z.array(ChangeEntrySchema).describe("Bug fixes"),
  performance: z.array(ChangeEntrySchema).describe("Performance improvements"),
  docs: z.array(ChangeEntrySchema).describe("Documentation updates"),
  other: z
    .array(ChangeEntrySchema)
    .describe("Other changes: refactors, chores, CI, tests, deps"),
  contributors: z.array(z.string()).describe("Unique GitHub usernames"),
  totalCommits: z.number().describe("Total number of commits"),
});

type ChangelogData = z.infer<typeof ChangelogSchema>;

const SECTIONS = [
  { key: "breaking" as const, heading: "Breaking Changes" },
  { key: "features" as const, heading: "New Features" },
  { key: "fixes" as const, heading: "Bug Fixes" },
  { key: "performance" as const, heading: "Performance" },
  { key: "docs" as const, heading: "Documentation" },
  { key: "other" as const, heading: "Other Changes" },
] as const;

const GITHUB_API = "https://api.github.com";

function formatMarkdown(
  owner: string,
  repo: string,
  fromRef: string,
  toRef: string,
  data: ChangelogData
): string {
  const lines: string[] = [
    `# Changelog: ${owner}/${repo}`,
    "",
    `## ${toRef} (from ${fromRef})`,
    "",
  ];

  let hasEntries = false;

  for (const { key, heading } of SECTIONS) {
    const entries = data[key];
    if (!entries?.length) continue;

    hasEntries = true;
    lines.push(`### ${heading}`, "");

    for (const entry of entries) {
      const pr = entry.prNumber
        ? ` ([#${entry.prNumber}](https://github.com/${owner}/${repo}/pull/${entry.prNumber}))`
        : "";
      const by = entry.author ? ` by @${entry.author}` : "";
      lines.push(`- ${entry.description}${pr}${by}`);
    }

    lines.push("");
  }

  if (!hasEntries) {
    lines.push("_No categorized changes found in this range._", "");
  }

  lines.push(
    "---",
    "",
    `**Full Changelog**: [${fromRef}...${toRef}](https://github.com/${owner}/${repo}/compare/${fromRef}...${toRef})`
  );

  if (data.contributors.length > 0) {
    const sorted = [...data.contributors].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    lines.push(`**Contributors**: ${sorted.map((c) => `@${c}`).join(", ")}`);
  }

  lines.push(`**Stats**: ${data.totalCommits} commits`);
  return lines.join("\n");
}

export const generateChangelog = new Autonomous.Tool({
  name: "generateChangelog",
  description:
    "Generate a formatted, categorized changelog between two Git refs. Fetches commits from the GitHub API and uses AI to categorize them.",

  input: z.object({
    owner: z.string().describe("GitHub repository owner"),
    repo: z.string().describe("GitHub repository name"),
    fromRef: z.string().describe("Starting ref (e.g. v1.0.0)"),
    toRef: z.string().describe("Ending ref (e.g. v2.0.0)"),
  }),

  output: z.string(),

  handler: async ({ owner, repo, fromRef, toRef }) => {
    const { githubToken } = context.get("configuration");
    const headers = {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${githubToken}`,
      "User-Agent": "botpress-changelogger",
    };

    const res = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/compare/${fromRef}...${toRef}`,
      { headers }
    );

    if (!res.ok) {
      return `Failed to compare ${fromRef}...${toRef}. Status: ${res.status}. Verify both refs exist.`;
    }

    const comparison = (await res.json()) as {
      commits: Array<{
        sha: string;
        commit: { message: string; author: { name: string } };
        author: { login: string } | null;
      }>;
    };

    if (!comparison.commits?.length) {
      return `No commits found between ${fromRef} and ${toRef}.`;
    }

    const commitSummary = comparison.commits
      .map((c) => {
        const author = c.author?.login ?? c.commit.author.name;
        return `- ${c.commit.message.split("\n")[0]} (by ${author})`;
      })
      .join("\n");

    const data = await adk.zai.extract(commitSummary, ChangelogSchema, {
      instructions: `Categorize these Git commits into the correct changelog sections:

- "breaking": Changes that break backward compatibility
- "features": New functionality (feat:, add, implement, introduce)
- "fixes": Bug fixes (fix:, bug, resolve, patch)
- "performance": Speed/memory improvements (perf:, optimize, cache)
- "docs": Documentation only (docs:, readme, jsdoc)
- "other": Everything else (refactor, chore, ci, build, test, deps)

Rules:
- Write clear, concise descriptions without conventional commit prefixes
- Extract PR numbers from messages like (#42)
- Include author usernames
- Skip merge commits`,
    });

    return formatMarkdown(owner, repo, fromRef, toRef, data);
  },
});
