import { Autonomous, z, adk, actions } from "@botpress/runtime";

const ChangeEntrySchema = z.object({
  description: z
    .string()
    .describe("A clean, human-readable one-line description of the change"),
  prNumber: z
    .number()
    .optional()
    .describe("The pull request number if one is referenced (e.g. #142)"),
  author: z
    .string()
    .optional()
    .describe("The GitHub username of the author/committer"),
});

const ChangelogDataSchema = z.object({
  breaking: z
    .array(ChangeEntrySchema)
    .describe("Breaking changes that require action from users"),
  features: z
    .array(ChangeEntrySchema)
    .describe("New features and enhancements"),
  fixes: z.array(ChangeEntrySchema).describe("Bug fixes and patches"),
  performance: z
    .array(ChangeEntrySchema)
    .describe("Performance improvements and optimizations"),
  docs: z
    .array(ChangeEntrySchema)
    .describe("Documentation updates and improvements"),
  other: z
    .array(ChangeEntrySchema)
    .describe(
      "Other changes: refactors, chores, CI/CD, tests, dependency bumps, styling"
    ),
  contributors: z
    .array(z.string())
    .describe("Unique GitHub usernames of all contributors in this range"),
  totalCommits: z
    .number()
    .describe("Total number of commits shown on the page"),
});

type ChangelogData = z.infer<typeof ChangelogDataSchema>;

const SECTIONS = [
  { key: "breaking" as const, emoji: "\u26a0\ufe0f", heading: "Breaking Changes" },
  { key: "features" as const, emoji: "\u2728", heading: "New Features" },
  { key: "fixes" as const, emoji: "\ud83d\udc1b", heading: "Bug Fixes" },
  { key: "performance" as const, emoji: "\u26a1", heading: "Performance" },
  { key: "docs" as const, emoji: "\ud83d\udcda", heading: "Documentation" },
  { key: "other" as const, emoji: "\ud83d\udd27", heading: "Other Changes" },
];

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

function formatMarkdown(
  owner: string,
  repo: string,
  fromRef: string,
  toRef: string,
  data: ChangelogData
): string {
  const lines: string[] = [];
  const title = toRef === "HEAD" ? "Unreleased" : toRef;

  lines.push(`# Changelog: ${owner}/${repo}`);
  lines.push("");
  lines.push(`## ${title} (from ${fromRef})`);
  lines.push("");

  let hasEntries = false;

  for (const { key, emoji, heading } of SECTIONS) {
    const entries = data[key];
    if (!entries || entries.length === 0) continue;

    hasEntries = true;
    lines.push(`### ${emoji} ${heading}`);
    lines.push("");

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
    lines.push("_No categorized changes found in this range._");
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
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
    "Generate a beautifully formatted, categorized changelog for a GitHub repository between two Git refs (tags, branches, or commit SHAs). Fetches the GitHub compare page and uses AI to extract and categorize all changes.",

  input: z.object({
    owner: z
      .string()
      .describe("GitHub repository owner (user or organization)"),
    repo: z.string().describe("GitHub repository name"),
    fromRef: z
      .string()
      .describe(
        "Starting ref - a tag (e.g. v1.0.0), branch name, or commit SHA"
      ),
    toRef: z
      .string()
      .default("HEAD")
      .describe(
        "Ending ref - a tag (e.g. v2.0.0), branch name, commit SHA, or 'HEAD' for latest"
      ),
  }),

  output: z.string(),

  handler: async ({ owner, repo, fromRef, toRef }) => {
    // Fetch the GitHub compare page via the browser integration
    const compareUrl = `https://github.com/${owner}/${repo}/compare/${fromRef}...${toRef}`;

    const browseResult = await actions.browser.browsePages({
      urls: [compareUrl],
      waitFor: 3000,
    });

    const results = (browseResult as any)?.results ?? browseResult;
    const page = Array.isArray(results) ? results[0] : results;
    const content = getPageContent(page);

    if (!content || content.length < 100) {
      return `Failed to fetch comparison from ${compareUrl}. Please verify:\n- The repository \`${owner}/${repo}\` exists and is public\n- Both refs exist: \`${fromRef}\` and \`${toRef}\``;
    }

    // Use Zai to extract structured changelog data from the page content
    const data = await adk.zai.extract(content, ChangelogDataSchema, {
      instructions: `You are analyzing a GitHub compare page showing changes between two Git refs.
Extract every commit and pull request visible on the page into the correct category:

- "breaking": Anything that breaks backward compatibility (BREAKING CHANGE, major API removal, breaking:)
- "features": New functionality (feat:, add, new, implement, introduce, support)
- "fixes": Bug fixes (fix:, bug, resolve, patch, correct, handle edge case)
- "performance": Speed/memory improvements (perf:, optimize, cache, speed up, reduce)
- "docs": Documentation only (docs:, readme, typo in docs, update docs, jsdoc)
- "other": Everything else (refactor, chore, ci, build, test, style, deps, bump, merge)

Rules:
- Write each description as a clear, concise sentence starting with a capital letter
- Strip conventional commit prefixes (feat:, fix:, etc.) from descriptions
- Include PR numbers when referenced (e.g. (#42) means prNumber: 42)
- Include the author's GitHub username when shown
- SKIP pure merge commits ("Merge pull request...", "Merge branch...")
- Count total commits and list all unique contributor usernames`,
    });

    return formatMarkdown(owner, repo, fromRef, toRef, data);
  },
});
