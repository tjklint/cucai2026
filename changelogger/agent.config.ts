import { z, defineConfig } from "@botpress/runtime";

export default defineConfig({
  name: "changelogger",
  description:
    "An AI agent that generates beautiful, categorized changelogs from GitHub repositories",

  defaultModels: {
    autonomous: "openai:gpt-4o",
    zai: "openai:gpt-4o-mini",
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
        enabled: false,
        configurationType: "manualApp",
        config: {
          githubAppId: "YOUR_GITHUBAPPID_HERE",
          githubAppPrivateKey: "YOUR_GITHUBAPPPRIVATEKEY_HERE",
          githubAppInstallationId: 0,
          githubWebhookSecret: "YOUR_GITHUBWEBHOOKSECRET_HERE",
        },
      },
      browser: { version: "browser@0.8.4", enabled: true },
      chat: { version: "chat@0.7.6", enabled: true },
    },
  },
});
