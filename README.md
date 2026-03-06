# CUCAI 2026 Workshop

**Building AI Agents with the Botpress ADK**

---

### What We're Building

An AI agent that watches your GitHub repos, generates beautiful changelogs when releases ship, and publishes them straight to Notion — all powered by the [Botpress Agent Development Kit](https://botpress.com/docs/adk/introduction).

```
PR Merged on GitHub
  --> Trigger catches the event
    --> Workflow runs an autonomous AI loop
      --> Fetches releases via GitHub API
      --> Categorizes commits with AI (zai.extract)
      --> Publishes formatted changelog to Notion
```

### Getting Started

```bash
cd changelogger
bun install
cp .env.example .env   # Add your secrets
adk dev                 # Start developing
```

See the full [Workshop Instructions](./changelogger/WORKSHOP.md) for setup, configuration, and a step-by-step walkthrough.

### Prerequisites

- [Bun](https://bun.sh)
- [Botpress ADK CLI](https://botpress.com/docs/for-developers/adk/getting-started) (`bun i -g @botpress/adk`)
- [Botpress Cloud](https://app.botpress.cloud) account
- [GitHub](https://github.com) account + Personal Access Token
- [Notion](https://notion.so) account + Internal Integration

### Key Concepts Covered

- **Triggers** — reacting to GitHub integration events
- **Workflows** — durable, long-running processes
- **Tools** — AI-callable functions with typed schemas
- **`execute()`** — the autonomous AI loop
- **`zai.extract()`** — LLM-powered structured data extraction
- **Integration Actions** — calling Notion from your agent
- **Conversations** — building interactive chat interfaces
- **Hooks** — injecting behavior into the execution lifecycle
