import { APIGatewayEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { Probot } from "probot";
import slashkudosBot from "./app";
import aws from "aws-sdk";
import {
  EmitterWebhookEvent,
  EmitterWebhookEventName,
  EmitterWebhookEventWithStringPayloadAndSignature,
} from "@octokit/webhooks/dist-types/types";

type SecretName =
  | "PRIVATE_KEY"
  | "WEBHOOK_SECRET"
  | "GITHUB_CLIENT_SECRET"
  | "KUDOS_GRAPHQL_API_KEY";

const handler = async (
  event: APIGatewayEvent
): Promise<APIGatewayProxyResultV2> => {
  console.log(`EVENT: ${JSON.stringify(event)}`);

  const isMock = process.env.AWS_EXECUTION_ENV === "AWS_Lambda_amplify-mock";
  process.env.IS_MOCK = isMock.toString();
  process.env.IS_PROD_APP = (process.env.APP_ID === "205195").toString();

  console.log(`IS_MOCK: ${process.env.IS_MOCK}`);
  console.log(`IS_PROD_APP: ${process.env.IS_PROD_APP}`);

  if (isMock) {
    process.env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "MOCK";
    process.env.APP_ID = process.env.APP_ID || "MOCK";
  } else {
    // Get secrets from SSM
    await loadSecrets();
  }
  if (!process.env.APP_ID) {
    throw "Missing APP_ID";
  }

  let probot = new Probot({
    appId: process.env.APP_ID,
    privateKey: process.env.PRIVATE_KEY,
    secret: process.env.WEBHOOK_SECRET,
  });

  console.log("Loading probot app");
  await probot.load(slashkudosBot);

  const eventHeaders = {
    id: event.headers["X-GitHub-Delivery"],
    name: event.headers["X-GitHub-Event"],
    signature: event.headers["X-Hub-Signature"] || "",
  };

  if (!eventHeaders.id) {
    throw new Error("Missing X-GitHub-Delivery header");
  }
  if (!eventHeaders.name) {
    throw new Error("Missing X-GitHub-Event header");
  }
  if (!eventHeaders.signature && !isMock) {
    throw new Error("Missing X-Hub-Signature header");
  }

  const webhookEvent: EmitterWebhookEventWithStringPayloadAndSignature = {
    id: eventHeaders.id,
    name: eventHeaders.name as unknown as EmitterWebhookEventName,
    signature: eventHeaders.signature,
    payload: JSON.parse(event.body || "{}"),
  };

  try {
    if (isMock) {
      console.log("Mock: Skipping signature verification");
      await probot.webhooks.receive(
        webhookEvent as unknown as EmitterWebhookEvent
      );
    } else {
      console.log("Verifying signature and handling webhook event");
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

// Load secrets from SSM and sets environment variables
const loadSecrets = async () => {
  console.log("Loading secrets from SSM");
  const secretNames: SecretName[] = [
    "PRIVATE_KEY",
    "WEBHOOK_SECRET",
    "KUDOS_GRAPHQL_API_KEY",
    "GITHUB_CLIENT_SECRET",
  ];
  const ssmParameterNames = secretNames
    .map((secretName) => process.env[secretName])
    .filter((parameterPath) => parameterPath != null) as string[];

  const { Parameters } = await new aws.SSM()
    .getParameters({
      Names: ssmParameterNames,
      WithDecryption: true,
    })
    .promise();
  if (!Parameters) {
    throw new Error("No parameters found");
  }

  secretNames.forEach((secretName) => {
    const secretValue = Parameters.find((p) =>
      p.Name?.endsWith(secretName)
    )?.Value;
    console.log(`Setting process.env.${secretName}`);
    if (!secretValue) {
      throw `Missing ${secretName}`;
    }
    process.env[secretName] = secretValue;
  });
};

exports.handler = handler;
export default handler;
