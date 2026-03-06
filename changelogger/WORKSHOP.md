# Changelogger Workshop

Build an AI agent that automatically generates changelogs from GitHub releases and publishes them to Notion — using the Botpress Agent Development Kit (ADK).

## Prerequisites

- [Bun](https://bun.sh) installed (`curl -fsSL https://bun.sh/install | bash`)
- [Botpress ADK CLI](https://botpress.com/docs/for-developers/adk/getting-started) installed (`bun i -g @botpress/adk`)
- A [Botpress Cloud](https://app.botpress.cloud) account (free)
- A [GitHub](https://github.com) account
- A [Notion](https://notion.so) account

---

## Part 1: Project Setup

### 1.1 — Scaffold the project

```bash
adk init changelogger
cd changelogger
```

### 1.2 — Log in to Botpress Cloud

```bash
adk login
```

### 1.3 — Install integrations

We need three integrations: **GitHub** (for PR merge triggers), **Notion** (for publishing), and **Chat** (for testing via CLI).

```bash
adk install github
adk install notion
adk install chat
```

### 1.4 — Generate types

Run a build to generate the type definitions we'll use throughout:

```bash
adk build
```

---

## Part 2: Configuration

### 2.1 — Set up secrets

Create a `.env` file in the project root (it's already in `.gitignore`):

```bash
touch .env
```

Add your secrets:

```env
GITHUB_PAT=your_github_personal_access_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret
NOTION_SECRET=your_notion_internal_integration_secret
```

**Where to get these:**

- **GitHub PAT**: [GitHub Settings > Developer Settings > Personal Access Tokens > Fine-grained tokens](https://github.com/settings/tokens?type=beta). Grant `read` access to the repos you want to track.
- **GitHub Webhook Secret**: Any random string (e.g. `openssl rand -hex 16`).
- **Notion Secret**: Create an [internal integration](https://www.notion.so/profile/integrations) in Notion, then copy the secret.

### 2.2 — Update `agent.config.ts`

Replace the contents of `agent.config.ts` with:

```typescript
import { z, defineConfig } from "@botpress/runtime";

export default defineConfig({
  name: "changelogger",
  description:
    "An AI agent that generates changelogs from GitHub releases and publishes them to Notion",

  defaultModels: {
    autonomous: "openai:gpt-4o-mini",
    zai: "openai:gpt-4o-mini",
  },

  configuration: {
    schema: z.object({
      githubToken: z
        .string()
        .describe("GitHub personal access token for REST API access"),
      notionPageId: z
        .string()
        .describe("Notion page ID where changelogs will be published"),
    }),
  },

  bot: {
    state: z.object({}),
  },

  user: {
    state: z.object({}),
  },

  dependencies: {
    integrations: {
      github: {
        version: "github@1.1.8",
        enabled: true,
        configurationType: "manualPAT",
        config: {
          personalAccessToken: process.env.GITHUB_PAT!,
          githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
        },
      },
      notion: {
        version: "notion@3.0.2",
        enabled: true,
        configurationType: "customApp",
        config: {
          internalIntegrationSecret: process.env.NOTION_SECRET!,
        },
      },
      chat: { version: "chat@0.7.6", enabled: true },
    },
  },
});
```

**Key things to note:**

- `defaultModels` — which LLMs to use for autonomous execution and Zai calls
- `configuration.schema` — defines config variables (`githubToken`, `notionPageId`) set in the Botpress Cloud dashboard at runtime
- `dependencies.integrations` — the integrations we installed, with secrets from `.env`

### 2.3 — Set configuration variables

After running `adk dev` for the first time, go to the Botpress Cloud dashboard:

1. Open your bot's settings
2. Under **Configuration**, set:
   - `githubToken` — same PAT from your `.env`
   - `notionPageId` — the 32-character hex ID from your Notion page URL (e.g. from `https://notion.so/My-Page-734fc6a7d9a64f31af4a105b0d98d256`, use `734fc6a7d9a64f31af4a105b0d98d256`)

### 2.4 — Connect Notion to the page

In Notion, open the page you want changelogs published to, then:

1. Click the `...` menu (top right)
2. Click **Connections**
3. Add the integration you created in step 2.1

---

## Part 3: Building the Tools

Tools are functions that the AI agent can call. We'll build three.

### 3.1 — Create the tools directory

```bash
mkdir -p src/tools
```

### 3.2 — `getLatestReleases.ts`

This tool fetches the latest releases from a GitHub repo via the REST API.

Create `src/tools/getLatestReleases.ts`:

```typescript
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
        const body = await res.text();
        return `Could not fetch releases for ${owner}/${repo}. Status: ${res.status}. Body: ${body}`;
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
```

**Concepts introduced:**

- `Autonomous.Tool` — defines a tool the AI can call during `execute()`
- `z.object(...)` — Zod schema for type-safe input/output
- `context.get("configuration")` — reads bot config variables set in the dashboard

### 3.3 — `generateChangelog.ts`

This is the core tool. It fetches the commit diff between two tags from GitHub, then uses `adk.zai.extract()` to have an LLM categorize the commits into a structured changelog.

Create `src/tools/generateChangelog.ts`:

```typescript
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
    try {
      const { githubToken } = context.get("configuration");
      const headers = {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${githubToken}`,
        "User-Agent": "botpress-changelogger",
      };

      // Try the refs as-is first, then with "v" prefix if 404
      let res = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/compare/${fromRef}...${toRef}`,
        { headers }
      );

      if (res.status === 404) {
        const vFrom = fromRef.startsWith("v") ? fromRef : `v${fromRef}`;
        const vTo = toRef.startsWith("v") ? toRef : `v${toRef}`;
        res = await fetch(
          `${GITHUB_API}/repos/${owner}/${repo}/compare/${vFrom}...${vTo}`,
          { headers }
        );
      }

      if (!res.ok) {
        const body = await res.text();
        return `Failed to compare ${fromRef}...${toRef}. Status: ${res.status}. Body: ${body}`;
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error generating changelog: ${message}`;
    }
  },
});
```

**Concepts introduced:**

- `adk.zai.extract()` — uses an LLM to extract structured data (matching a Zod schema) from unstructured text. This is the magic: raw commit messages go in, a categorized changelog comes out.
- The `v` prefix fallback — handles both `v1.0.0` and `1.0.0` tag formats.

### 3.4 — `publishChangelog.ts`

This tool publishes markdown to a Notion page using the Notion integration's `appendBlocksToPage` action.

Create `src/tools/publishChangelog.ts`:

```typescript
import { Autonomous, z, actions, context } from "@botpress/runtime";

export const publishChangelog = new Autonomous.Tool({
  name: "publishChangelog",
  description:
    "Publish a markdown changelog to the configured Notion page by appending it as content blocks.",

  input: z.object({
    markdown: z
      .string()
      .describe("The formatted markdown changelog to publish"),
  }),

  output: z.string(),

  handler: async ({ markdown }) => {
    const config = context.get("configuration");
    let notionPageId = config.notionPageId;

    if (!notionPageId) {
      return `Error: notionPageId is not configured. Set it in the bot configuration dashboard.`;
    }

    // Format as UUID with dashes if needed (Notion API expects dashed format)
    const hex = notionPageId.replace(/-/g, "");
    if (hex.length === 32) {
      notionPageId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    try {
      const result = await actions.notion.appendBlocksToPage({
        pageId: notionPageId,
        markdownText: markdown,
      });

      return `Published to Notion. Page ID used: "${notionPageId}". API response: ${JSON.stringify(result)}`;
    } catch (err: any) {
      const details = JSON.stringify(
        err,
        Object.getOwnPropertyNames(err ?? {}),
        2
      );
      return `Failed to publish to Notion. Page ID: "${notionPageId}". Full error: ${details}`;
    }
  },
});
```

**Concepts introduced:**

- `actions.notion.appendBlocksToPage()` — calling an integration action directly. The Notion integration converts markdown to Notion blocks automatically.
- UUID formatting — Notion page IDs need dashes, but users often copy them without.

---

## Part 4: The Trigger and Workflow

### 4.1 — Understanding the flow

When a PR is merged on GitHub:

```
GitHub PR Merged
    --> Trigger (catches the event)
        --> Workflow (runs execute() with tools)
            --> AI orchestrates: get releases -> generate changelog -> publish to Notion
```

**Why a workflow?** Triggers only receive `{ event }` — they don't have access to `execute()`. Workflows do, so the trigger starts a workflow which runs the autonomous AI loop.

### 4.2 — Create the workflow

Create `src/workflows/changelog.ts`:

```typescript
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
```

**Concepts introduced:**

- `Workflow` — a durable, long-running process
- `execute()` — the autonomous AI loop. You give it instructions and tools, and it decides how to use them.
- `input`/`output` schemas — typed contracts for what the workflow receives and returns

### 4.3 — Create the trigger

Delete the placeholder trigger file, then create the real one.

```bash
rm src/triggers/index.ts
```

Create `src/triggers/prMerged.ts`:

```typescript
import { Trigger } from "@botpress/runtime";
import changelogWorkflow from "../workflows/changelog";

export default new Trigger({
  name: "prMerged",
  events: ["github:pullRequestMerged"],

  handler: async ({ event }) => {
    const { owner, name: repo } = event.pullRequest.repository;

    await changelogWorkflow.start({
      owner: owner.handle,
      repo,
    });
  },
});
```

**Concepts introduced:**

- `Trigger` — listens for integration events (in this case, GitHub PR merges)
- `event.pullRequest.repository` — typed payload from the GitHub integration
- `changelogWorkflow.start()` — starts a workflow instance with input data

---

## Part 5: Chat Interface

For testing (and demos), we'll add a chat conversation so you can manually ask the bot to generate changelogs.

Delete the placeholder conversation file:

```bash
rm src/conversations/index.ts
```

Create `src/conversations/chat.ts`:

```typescript
import { Conversation } from "@botpress/runtime";
import { getLatestReleases } from "../tools/getLatestReleases";
import { generateChangelog } from "../tools/generateChangelog";
import { publishChangelog } from "../tools/publishChangelog";

export default new Conversation({
  channel: "chat.channel",

  async handler({ execute, conversation }) {
    await execute({
      instructions: `You are Changelogger, an AI that generates changelogs from GitHub releases and publishes them to Notion.

When a user provides a GitHub repository (as "owner/repo" or a URL) and optionally a tag range:
1. If they specified two tags, call generateChangelog directly with those as fromRef and toRef
2. If they only specified a repo, call getLatestReleases first to show available releases
3. If the changelog was generated successfully (not an error), show it to the user and ask if they want to publish it to Notion
4. If yes, call publishChangelog with the markdown
5. NEVER publish error messages or failed results to Notion

IMPORTANT:
- Always show the full changelog output to the user
- If a tool returns an error, show the EXACT error message to the user verbatim so they can debug it
- Never paraphrase or summarize tool errors - copy the full error text into your response
- After publishing, show the full tool response including the page ID and API response`,
      tools: [getLatestReleases, generateChangelog, publishChangelog],
      hooks: {
        onBeforeTool: async ({ tool }) => {
          const messages: Record<string, string> = {
            getLatestReleases: "Fetching releases from GitHub...",
            generateChangelog: "Generating changelog from commits...",
            publishChangelog: "Publishing changelog to Notion...",
          };
          const msg = messages[tool.name];
          if (msg) {
            await conversation.send({ type: "text", payload: { text: msg } });
          }
        },
      },
    });
  },
});
```

**Concepts introduced:**

- `Conversation` — handles messages from a specific channel
- `hooks.onBeforeTool` — runs before each tool call, used here to send progress messages so the user isn't left waiting in silence
- Same `execute()` pattern as the workflow, but in a conversational context

---

## Part 7: Build and Test

### 7.1 — Build

```bash
adk build
```

If the build succeeds, you're good to go.

### 7.2 — Start the dev server

```bash
adk dev
```

This starts a local dev server with hot reloading. The console is available at http://localhost:3001.

### 7.3 — Test via CLI chat

In a separate terminal:

```bash
adk chat
```

Try these prompts:

```
> Generate a changelog for botpress/adk from v1.15.1 to v1.15.4
> What releases are available for facebook/react?
> Generate a changelog for vercel/next.js from v15.0.0 to v15.1.0
```

### 7.4 — Deploy

When you're happy with the results:

```bash
adk deploy
```

---

## Architecture Recap

```
src/
  triggers/
    prMerged.ts          # Catches GitHub PR merge events
  workflows/
    changelog.ts         # Runs the AI loop with execute()
  tools/
    getLatestReleases.ts # Fetches releases from GitHub REST API
    generateChangelog.ts # Compares tags + AI categorization via zai.extract()
    publishChangelog.ts  # Publishes markdown to Notion
  conversations/
    chat.ts              # Manual chat interface for testing
```

**Data flow:**

```
PR Merged (GitHub)
  --> prMerged trigger
    --> changelog workflow
      --> execute() with instructions + tools
        --> AI calls getLatestReleases
        --> AI calls generateChangelog
        --> AI calls publishChangelog
          --> Changelog appears on Notion page
```

---

## Key ADK Concepts Used

| Concept | Where | What it does |
|---|---|---|
| `Trigger` | `prMerged.ts` | Listens for integration events |
| `Workflow` | `changelog.ts` | Durable, long-running process with `execute()` |
| `Autonomous.Tool` | `src/tools/*.ts` | Functions the AI can call |
| `execute()` | `changelog.ts`, `chat.ts` | Autonomous AI loop — give it instructions + tools |
| `adk.zai.extract()` | `generateChangelog.ts` | LLM-powered structured data extraction |
| `actions.notion.*` | `publishChangelog.ts` | Calling integration actions |
| `context.get()` | All tools | Accessing bot configuration at runtime |
| `Conversation` | `chat.ts` | Handling user messages from a channel |
| `hooks.onBeforeTool` | `chat.ts` | Sending progress updates during execution |

---

## Troubleshooting

**"Could not find integration 'notion'"** — Make sure `enabled: true` is set for the integration in `agent.config.ts`.

**GitHub API returns 404** — Check that the tag names exist. The tool auto-retries with a `v` prefix (e.g. `1.0.0` -> `v1.0.0`).

**Notion publish fails** — Make sure:
1. The Notion page is connected to your integration (page `...` menu > Connections)
2. The `notionPageId` is the 32-character hex ID from the page URL
3. The integration secret in `.env` matches the one in Notion

**"notionPageId is not configured"** — Set it in the Botpress Cloud dashboard under your bot's Configuration settings.

**Bot doesn't respond in chat** — Make sure the `chat` integration is installed and enabled.
