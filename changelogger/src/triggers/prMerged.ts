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
