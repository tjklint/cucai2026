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
    const { notionPageId } = context.get("configuration");

    const result = await actions.notion.appendBlocksToPage({
      pageId: notionPageId,
      markdownText: markdown,
    });

    return `Changelog published to Notion page ${notionPageId}. Block IDs: ${result.blockIds?.join(", ") ?? "created"}`;
  },
});
