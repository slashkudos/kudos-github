import { Context, Probot } from "probot";
import {
  DataSourceApp,
  KudosApiClient,
  KudosGraphQLConfig,
} from "@slashkudos/kudos-api";
import { EmitterWebhookEvent } from "@octokit/webhooks/dist-types/types";
import { User } from "@octokit/webhooks-types";
import { GitHubComment } from "./models/GitHub/GitHubComment";
import {
  AddDiscussionCommentInput,
  AddDiscussionCommentPayload,
} from "@octokit/graphql-schema";
import { GitHubCommentCreatedEvent } from "./models/GitHub/GitHubCommentCreatedEvent";
import { KudosGitHubMetadata } from "./models/KudosGitHubMetadata";

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

      const payload = eventContext.payload as GitHubCommentCreatedEvent;
      const comment = payload.comment as unknown as GitHubComment;
      const commentBody = comment.body.trim();

      let slashCommand = "/kudos";
      if (process.env.IS_PROD_APP !== "true") {
        slashCommand += "-dev";
      }
      // Make sure we check for the space after the slash command
      slashCommand += " ";

      console.log(`Checking comment for kudos.`);
      console.log(
        `Comment: "${commentBody}"\nSlash Command: "${slashCommand}"`
      );
      if (commentBody.startsWith(slashCommand)) {
        console.log("Kudos!");

        const kudosClient = await getKudosClient();
        const octokit = eventContext.octokit;

        const mentions = commentBody
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

          await createKudo(kudosClient, giver, receiverUser, comment, {
            repositoryPublic: payload.repository.private === false,
            repositoryUrl: payload.repository.html_url,
          });

          const userTotal = await kudosClient.getTotalKudosForReceiver(
            receiverLogin,
            DataSourceApp.github
          );
          await createComment(eventContext, receiverLogin, payload, userTotal);
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
  comment: GitHubComment,
  metadata: KudosGitHubMetadata
) {
  const link = comment.html_url || comment.url;
  await kudosClient.createKudo({
    giverUsername: giver,
    receiverUsername: receiverUser.login,
    message: comment.body.trim(),
    link: link,
    giverProfileUrl: comment.user.html_url,
    giverProfileImageUrl: comment.user.avatar_url,
    receiverProfileUrl: receiverUser.html_url,
    receiverProfileImageUrl: receiverUser.avatar_url,
    dataSource: DataSourceApp.github,
    metadata: metadata,
  });
}

async function createComment(
  eventContext: Context<
    | "issue_comment.created"
    | "discussion_comment.created"
    | "pull_request_review_comment.created"
  >,
  receiver: string,
  payload: GitHubCommentCreatedEvent,
  totalKudos?: number | null
) {
  const octokit = eventContext.octokit;

  const siteUrl =
    process.env.IS_PROD_APP === "true"
      ? "https://app.slashkudos.com/"
      : "https://app-dev.slashkudos.com/";

  let commentBody = `Congrats @${receiver}, you just got another [kudo](${siteUrl})! :tada:`;
  if (totalKudos) {
    commentBody = `Congrats @${receiver}, you now have ${totalKudos} [kudos](${siteUrl})! :tada:`;
    if (totalKudos === 1) {
      commentBody = `Congrats @${receiver}, you just got your first [kudo](${siteUrl})! :tada: :partying_face:`;
    }
  } else {
    console.log("WARN: Could not find total kudos for receiver: " + receiver);
  }

  const quoteOriginalComment = `> ${payload.comment.body.trim()}\n\n`;
  const bodyWithQuote = `${quoteOriginalComment}${commentBody}`;
  if (eventContext.name === "issue_comment") {
    console.log("Creating comment on issue");
    await octokit.issues.createComment({
      ...eventContext.issue(),
      body: bodyWithQuote,
    });
  } else if (eventContext.name === "pull_request_review_comment") {
    console.log("Creating reply on PR review comment");
    await octokit.pulls.createReplyForReviewComment({
      ...eventContext.pullRequest(),
      comment_id: payload.comment.id,
      body: commentBody,
    });
  } else if (eventContext.name === "discussion_comment") {
    console.log("Creating reply to discussion comment");
    // https://docs.github.com/en/graphql/reference/mutations#adddiscussioncomment
    const input: AddDiscussionCommentInput = {
      body: commentBody,
      discussionId: payload.discussion.node_id,
      replyToId: payload.comment.node_id,
    };
    await octokit.graphql<{
      addDiscussionComment: AddDiscussionCommentPayload;
    }>(
      `mutation ($body: String!, $discussionId: ID!, $replyToId: ID, $clientMutationId: String) {
        # input type: AddDiscussionCommentInput
        addDiscussionComment(input: {body: $body, discussionId: $discussionId, replyToId: $replyToId, clientMutationId: $clientMutationId}) {
          # response type: AddDiscussionCommentPayload
          comment {
            id
          }
        }
      }`,
      input
    );
  }
  console.log("Comment created");
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
