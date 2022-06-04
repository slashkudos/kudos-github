import { PullRequestReviewComment } from "@octokit/graphql-schema";
import {
  AuthorAssociation,
  IssueComment,
  Reactions,
  User,
} from "@octokit/webhooks-types";

export type GitHubComment = {
  id: number;
  node_id: string;
  html_url: string;
  parent_id: number | null;
  child_comment_count: number;
  repository_url: string;
  discussion_id: number;
  author_association: AuthorAssociation;
  user: User;
  created_at: string;
  updated_at: string;
  body: string;
  reactions: Reactions;
} & IssueComment &
  PullRequestReviewComment;
