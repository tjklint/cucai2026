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
