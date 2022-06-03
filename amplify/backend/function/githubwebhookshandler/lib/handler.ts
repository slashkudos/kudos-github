import { APIGatewayEvent } from "aws-lambda";
import { Probot } from "probot";
import slashkudosBot from "./app";
import aws from "aws-sdk";
import { WebhookEvent, WebhookEvents } from "@octokit/webhooks";

type SecretName = "PRIVATE_KEY" | "WEBHOOK_SECRET";

exports.handler = async (event: APIGatewayEvent) => {
  const secretNames: SecretName[] = ["PRIVATE_KEY", "WEBHOOK_SECRET"];
  const ssmParameterNames = secretNames
    .map((secretName) => process.env[secretName])
    .filter((parameterPath) => !parameterPath) as string[];

  const { Parameters } = await new aws.SSM()
    .getParameters({
      Names: ssmParameterNames,
      WithDecryption: true,
    })
    .promise();

  if (!Parameters) {
    throw new Error("No parameters found");
  }

  process.env.PRIVATE_KEY = Parameters.find((p) =>
    p.Name?.endsWith("PRIVATE_KEY")
  )?.Value;
  process.env.WEBHOOK_SECRET = Parameters.find((p) =>
    p.Name?.endsWith("WEBHOOK_SECRET")
  )?.Value;

  process.env.IS_MOCK = (
    process.env.AWS_EXECUTION_ENV === "AWS_Lambda_amplify-mock"
  ).toString();

  if (!process.env.PRIVATE_KEY) {
    throw "Missing PRIVATE_KEY";
  }
  if (!process.env.WEBHOOK_SECRET) {
    throw "Missing WEBHOOK_SECRET";
  }
  if (!process.env.APP_ID) {
    throw "Missing APP_ID";
  }

  let probot = new Probot({
    appId: process.env.APP_ID,
    privateKey: Buffer.from(process.env.PRIVATE_KEY, "base64").toString(
      "utf-8"
    ),
    secret: process.env.WEBHOOK_SECRET,
  });

  await probot.load(slashkudosBot);

  const webhookEvent: WebhookEvent<any> & {
    signature: string;
  } = {
    id: event.headers["x-github-delivery"] || "",
    name: (event.headers["x-github-event"] || "*") as unknown as WebhookEvents,
    signature: event.headers["x-hub-signature"] || "",
    payload: JSON.parse(event.body || "{}"),
  };

  if (!webhookEvent.id) {
    throw new Error("Missing x-github-delivery header");
  }
  if (!webhookEvent.name) {
    throw new Error("Missing x-github-event header");
  }
  if (!webhookEvent.signature && process.env.IS_MOCK !== "true") {
    throw new Error("Missing x-hub-signature header");
  }

  if (process.env.IS_MOCK === "true") {
    console.log("Mock: Skipping signature verification");
    return await probot.webhooks.receive(webhookEvent);
  } else {
    return await probot.webhooks.verifyAndReceive(webhookEvent);
  }
};
