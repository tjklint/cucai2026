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
      webchat: { version: "webchat@0.3.0", enabled: true },
    },
  },
});
