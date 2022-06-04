import { Context, Probot } from "probot";
import {
  DataSourceApp,
  KudosApiClient,
  KudosGraphQLConfig,
} from "@slashkudos/kudos-api";
import { EmitterWebhookEvent } from "@octokit/webhooks/dist-types/types";
import { User } from "@octokit/webhooks-types";
import { GitHubComment } from "./models/GitHub/GitHubComment";

const app = (app: Probot) => {
  app.onAny((event: EmitterWebhookEvent): void =>
    console.log(`Received Webhook: ${JSON.stringify(event)}`)
  );
  app.on(
    [
      "issue_comment.created",
      "discussion_comment.created",
      "pull_request_review_comment.created",
    ],
    async (eventContext) => {
      console.log(`Received ${eventContext.name} event`);

      const comment = eventContext.payload.comment;

      let slashCommand = "/kudos";
      if (process.env.IS_PROD_APP !== "true") {
        slashCommand += "-dev";
      }
      // Make sure we check for the space after the slash command
      slashCommand += " ";

      console.log(`Checking comment for kudos.`);
      console.log(
        `Comment: "${comment.body}"\nSlash Command: "${slashCommand}"`
      );
      if (comment.body.startsWith(slashCommand)) {
        console.log("Kudos!");

        const kudosClient = await getKudosClient();
        const octokit = eventContext.octokit;

        const mentions = comment.body
          .split(" ")
          .filter((word) => word.startsWith("@") && word.length > 1)
          .map((mention) => mention.substring(1));
        console.log("Mentions: " + mentions);

        if (mentions.length === 0) {
          console.log("No mentions found.");
        }

        const giver = comment.user.login;
        for (const mention of mentions) {
          const receiverLogin = mention;
          const getReceiverResponse = await octokit.users.getByUsername({
            username: receiverLogin,
          });
          const receiverUser = getReceiverResponse.data as User;

          if (!receiverUser) {
            console.log("WARN: Could not find user: " + receiverLogin);
            continue;
          }

          await createKudo(
            kudosClient,
            giver,
            receiverUser,
            comment as GitHubComment
          );

          await createComment(eventContext, mention);
        }
      } else {
        console.log("Not a kudos comment");
      }
    }
  );
};

async function createKudo(
  kudosClient: KudosApiClient,
  giver: string,
  receiverUser: User,
  comment: GitHubComment
) {
  const link = comment.html_url || comment.url;
  await kudosClient.createKudo({
    giverUsername: giver,
    receiverUsername: receiverUser.login,
    message: comment.body,
    link: link,
    giverProfileImageUrl: comment.user.avatar_url,
    receiverProfileImageUrl: receiverUser.avatar_url,
    dataSource: DataSourceApp.github,
  });
}

/** Adds a comment to an Issue or Pull Request. */
// addComment?: Maybe<AddCommentPayload>;
/** Adds a comment to a Discussion, possibly as a reply to another comment. */
// addDiscussionComment?: Maybe<AddDiscussionCommentPayload>;
/** Adds a comment to a review. */
// addPullRequestReviewComment?: Maybe<AddPullRequestReviewCommentPayload>;
/** Creates a new team discussion comment. */
// createTeamDiscussionComment?: Maybe<CreateTeamDiscussionCommentPayload>;
async function createComment(
  eventContext: Context<
    | "issue_comment.created"
    | "discussion_comment.created"
    | "pull_request_review_comment.created"
  >,
  mention: string
) {
  const octokit = eventContext.octokit;
  const body = `Congrats @${mention}, you just received some kudos! :tada:`;
  if (eventContext.name === "issue_comment") {
    console.log("Creating comment on issue");
    await octokit.issues.createComment({
      ...eventContext.issue(),
      body: body,
    });
  } else if (eventContext.name === "pull_request_review_comment") {
    console.log("Creating reply on PR review comment");
    await octokit.pulls.createReplyForReviewComment({
      ...eventContext.pullRequest(),
      comment_id: eventContext.payload.comment.id,
      body: body,
    });
  } else if (eventContext.name === "discussion_comment") {
    console.log("NOT YET IMPLEMENTED: Adding discussion comment");

    // eventContext.octokit.graphql<{
    //   addComment: AddCommentPayload;
    // }>(
    //   `mutation {
    //     # input type: AddCommentInput
    //     addComment(input: {repositoryId: "1234", categoryId: "5678", body: "The body", title: "The title"}) {
    //       # response type: CreateDiscussionPayload
    //       discussion {
    //         id
    //       }
    //     }
    //   }`,
    //   {
    //     owner: options.owner,
    //     repo: options.repo,
    //   }
    // );
  }
}

async function getKudosClient() {
  const apiKey = process.env.KUDOS_GRAPHQL_API_KEY,
    apiUrl = process.env.KUDOS_GRAPHQL_API_URL;

  if (!apiKey) {
    throw new Error("Missing KUDOS_GRAPHQL_API_KEY");
  }
  if (!apiUrl) {
    throw new Error("Missing KUDOS_GRAPHQL_API_URL");
  }

  const kudosApiConfig: KudosGraphQLConfig = {
    ApiKey: apiKey,
    ApiUrl: apiUrl,
  };
  const kudosApiClient = await KudosApiClient.build(kudosApiConfig);
  return kudosApiClient;
}

export default app;
