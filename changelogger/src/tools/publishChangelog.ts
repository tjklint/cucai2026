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
