import {
  DiscussionCommentCreatedEvent,
  IssueCommentCreatedEvent,
  PullRequestReviewCommentCreatedEvent,
} from "@octokit/webhooks-types";

export type GitHubCommentCreatedEvent = DiscussionCommentCreatedEvent &
  IssueCommentCreatedEvent &
  PullRequestReviewCommentCreatedEvent;
