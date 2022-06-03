import { APIGatewayEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { Probot } from "probot";
import slashkudosBot from "./app";
import aws from "aws-sdk";
import {
  EmitterWebhookEvent,
  EmitterWebhookEventName,
  EmitterWebhookEventWithStringPayloadAndSignature,
} from "@octokit/webhooks/dist-types/types";

type SecretName = "PRIVATE_KEY" | "WEBHOOK_SECRET";

const handler = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResultV2> => {
  console.log(`EVENT: ${JSON.stringify(event)}`);
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

  const eventHeaders = {
    id: event.headers["x-github-delivery"],
    name: event.headers["x-github-event"],
    signature: event.headers["x-hub-signature"] || "",
  };

  if (!eventHeaders.id) {
    throw new Error("Missing x-github-delivery header");
  }
  if (!eventHeaders.name) {
    throw new Error("Missing x-github-event header");
  }
  if (!eventHeaders.signature && process.env.IS_MOCK !== "true") {
    throw new Error("Missing x-hub-signature header");
  }

  const webhookEvent: EmitterWebhookEventWithStringPayloadAndSignature = {
    id: eventHeaders.id,
    name: eventHeaders.name as unknown as EmitterWebhookEventName,
    signature: eventHeaders.signature,
    payload: JSON.parse(event.body || "{}"),
  };

  try {
    if (process.env.IS_MOCK === "true") {
      console.log("Mock: Skipping signature verification");
      await probot.webhooks.receive(
        webhookEvent as unknown as EmitterWebhookEvent
      );
    } else {
      await probot.webhooks.verifyAndReceive(webhookEvent);
    }
    return {
      statusCode: 200,
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Something went wrong." }),
    };
  }
};

export default handler;
