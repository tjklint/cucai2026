import { Autonomous, z, adk } from "@botpress/runtime";

const API = "https://api.github.com";

const headers: Record<string, string> = {
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "botpress-changelogger",
};

interface CommitData {
  sha: string;
  message: string;
  authorLogin?: string;
  authorName: string;
}

interface PRData {
  number: number;
  title: string;
  author: string;
  labels: string[];
  body: string;
}

type Category =
  | "breaking"
  | "features"
  | "fixes"
  | "performance"
  | "docs"
  | "other";

interface ChangeEntry {
  category: Category;
  title: string;
  prNumber?: number;
  author?: string;
}

async function ghFetch<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers });
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = res.headers.get("x-ratelimit-reset");
    const at = reset
      ? new Date(parseInt(reset) * 1000).toISOString()
      : "unknown";
    throw new Error(`GitHub rate limit hit. Resets at ${at}.`);
  }
  if (res.status === 404) {
    throw new Error("GitHub 404 - check that the repo and refs exist.");
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

function categorize(title: string, labels: string[]): Category {
  const l = labels.map((s) => s.toLowerCase());

  if (
    l.some((x) => x.includes("breaking")) ||
    /^breaking[\s(:!]/i.test(title)
  )
    return "breaking";
  if (
    l.some((x) =>
      ["feature", "enhancement", "feat"].some((k) => x.includes(k))
    ) ||
    /^feat[\s(:]/i.test(title)
  )
    return "features";
  if (
    l.some((x) => ["bug", "fix", "hotfix"].some((k) => x.includes(k))) ||
    /^fix[\s(:]/i.test(title)
  )
    return "fixes";
  if (
    l.some((x) => ["perf", "performance"].some((k) => x.includes(k))) ||
    /^perf[\s(:]/i.test(title)
  )
    return "performance";
  if (
    l.some((x) => ["doc", "documentation"].some((k) => x.includes(k))) ||
    /^docs?[\s(:]/i.test(title)
  )
    return "docs";

  return "other";
}

function cleanTitle(raw: string): string {
  let t = raw
    .replace(
      /^(feat|fix|docs?|perf|refactor|chore|ci|build|test|style|breaking)(\([^)]*\))?[:\s!]+/i,
      ""
    )
    .replace(/\s*\(#\d+\)\s*$/, "")
    .trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const SECTIONS: { key: Category; emoji: string; heading: string }[] = [
  { key: "breaking", emoji: "\u26a0\ufe0f", heading: "Breaking Changes" },
  { key: "features", emoji: "\u2728", heading: "New Features" },
  { key: "fixes", emoji: "\ud83d\udc1b", heading: "Bug Fixes" },
  { key: "performance", emoji: "\u26a1", heading: "Performance" },
  { key: "docs", emoji: "\ud83d\udcda", heading: "Documentation" },
  { key: "other", emoji: "\ud83d\udd27", heading: "Other Changes" },
];

export const generateChangelog = new Autonomous.Tool({
  name: "generateChangelog",
  description:
    "Generate a formatted changelog for a GitHub repository between two Git refs (tags, branches, or SHAs). Fast - uses the GitHub REST API directly.",

  input: z.object({
    owner: z
      .string()
      .describe("GitHub repository owner (user or organization)"),
    repo: z.string().describe("GitHub repository name"),
    fromRef: z
      .string()
      .describe("Starting ref (tag like v1.0.0, branch, or SHA)"),
    toRef: z
      .string()
      .default("HEAD")
      .describe("Ending ref (tag like v2.0.0, branch, SHA, or HEAD)"),
  }),

  output: z.string(),

  handler: async ({ owner, repo, fromRef, toRef }) => {
    // 1. Fetch comparison from GitHub API
    const compare = await ghFetch<any>(
      `/repos/${owner}/${repo}/compare/${encodeURIComponent(fromRef)}...${encodeURIComponent(toRef)}`
    );

    const commits: CommitData[] = (compare.commits || []).map((c: any) => ({
      sha: c.sha,
      message: (c.commit?.message || "").split("\n")[0],
      authorLogin: c.author?.login,
      authorName: c.commit?.author?.name || "Unknown",
    }));

    // 2. Extract PR numbers from commit messages
    const prNums = new Set<number>();
    for (const c of compare.commits || []) {
      const msg: string = c.commit?.message || "";
      for (const m of msg.matchAll(/#(\d+)/g)) {
        prNums.add(parseInt(m[1], 10));
      }
    }

    // 3. Fetch PR details in parallel batches
    const prs: PRData[] = [];
    const nums = [...prNums];
    for (let i = 0; i < nums.length; i += 15) {
      const batch = nums.slice(i, i + 15);
      const results = await Promise.allSettled(
        batch.map(async (n) => {
          const pr = await ghFetch<any>(
            `/repos/${owner}/${repo}/pulls/${n}`
          );
          if (!pr.merged_at) return null;
          return {
            number: pr.number,
            title: pr.title,
            author: pr.user?.login || "unknown",
            labels: (pr.labels || []).map((l: any) => l.name),
            body: (pr.body || "").slice(0, 300),
          } as PRData;
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) prs.push(r.value);
      }
    }

    // 4. Build entries - prefer PRs over raw commits
    const entries: ChangeEntry[] = [];
    const contributors = new Set<string>();

    if (prs.length > 0) {
      for (const pr of prs) {
        entries.push({
          category: categorize(pr.title, pr.labels),
          title: cleanTitle(pr.title),
          prNumber: pr.number,
          author: pr.author,
        });
        contributors.add(pr.author);
      }
    } else {
      // No PRs - use commits directly
      for (const c of commits) {
        if (c.message.startsWith("Merge ")) continue;
        entries.push({
          category: categorize(c.message, []),
          title: cleanTitle(c.message),
          author: c.authorLogin || c.authorName,
        });
        if (c.authorLogin) contributors.add(c.authorLogin);
      }
    }

    // 5. If we have many uncategorized entries, use Zai to improve categorization
    const otherCount = entries.filter((e) => e.category === "other").length;
    if (otherCount > entries.length * 0.6 && entries.length > 5) {
      const uncategorized = entries
        .filter((e) => e.category === "other")
        .map((e) => e.title);

      const refined = await adk.zai.extract(
        uncategorized.join("\n"),
        z.array(
          z.object({
            title: z.string(),
            category: z.enum([
              "breaking",
              "features",
              "fixes",
              "performance",
              "docs",
              "other",
            ]),
          })
        ),
        {
          instructions:
            'Categorize each change line into: breaking, features, fixes, performance, docs, or other. Use "features" for new functionality, "fixes" for bug fixes, "other" for chores/refactors/CI/tests.',
        }
      );

      const catMap = new Map(refined.map((r) => [r.title, r.category]));
      for (const entry of entries) {
        if (entry.category === "other" && catMap.has(entry.title)) {
          entry.category = catMap.get(entry.title)!;
        }
      }
    }

    // 6. Group and format markdown
    const grouped = new Map<Category, ChangeEntry[]>();
    for (const e of entries) {
      const list = grouped.get(e.category) || [];
      list.push(e);
      grouped.set(e.category, list);
    }

    const lines: string[] = [];
    const title = toRef === "HEAD" ? "Unreleased" : toRef;

    lines.push(`# Changelog: ${owner}/${repo}`);
    lines.push("");
    lines.push(`## ${title} (from ${fromRef})`);
    lines.push("");

    let hasEntries = false;
    for (const { key, emoji, heading } of SECTIONS) {
      const items = grouped.get(key);
      if (!items || items.length === 0) continue;
      hasEntries = true;
      lines.push(`### ${emoji} ${heading}`);
      lines.push("");
      for (const e of items) {
        const pr = e.prNumber
          ? ` ([#${e.prNumber}](https://github.com/${owner}/${repo}/pull/${e.prNumber}))`
          : "";
        const by = e.author ? ` by @${e.author}` : "";
        lines.push(`- ${e.title}${pr}${by}`);
      }
      lines.push("");
    }

    if (!hasEntries) {
      lines.push("_No categorized changes found._");
      lines.push("");
    }

    lines.push("---");
    lines.push("");
    lines.push(
      `**Full Changelog**: [${fromRef}...${toRef}](https://github.com/${owner}/${repo}/compare/${fromRef}...${toRef})`
    );
    if (contributors.size > 0) {
      const sorted = [...contributors].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      );
      lines.push(
        `**Contributors**: ${sorted.map((c) => `@${c}`).join(", ")}`
      );
    }
    lines.push(
      `**Stats**: ${compare.total_commits || commits.length} commits, ${prs.length} pull requests`
    );

    return lines.join("\n");
  },
});
