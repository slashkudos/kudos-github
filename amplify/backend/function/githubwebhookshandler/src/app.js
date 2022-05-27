const { Probot } = require('probot');
const slashkudosBot = require('./lib/index');
const aws = require("aws-sdk");

exports.handler = async (event) => {
    const { Parameters } = await (new aws.SSM())
        .getParameters({
            Names: ["PRIVATE_KEY", "WEBHOOK_SECRET"].map(secretName => process.env[secretName]),
            WithDecryption: true,
        })
        .promise();

    process.env.PRIVATE_KEY = Parameters.find(p => p.Name.endsWith('PRIVATE_KEY')).Value;
    process.env.WEBHOOK_SECRET = Parameters.find(p => p.Name.endsWith('WEBHOOK_SECRET')).Value;
    process.env.IS_MOCK = process.env.AWS_EXECUTION_ENV === "AWS_Lambda_amplify-mock";

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
        privateKey: Buffer.from(process.env.PRIVATE_KEY, 'base64').toString('utf-8'),
        secret: process.env.WEBHOOK_SECRET,
    });

    await probot.load(slashkudosBot);

    const probotArgs = {
        id: event.headers['x-github-delivery'],
        name: event.headers['x-github-event'],
        signature: event.headers['x-hub-signature'],
        payload: event.body
    }

    if (process.env.IS_MOCK) {
        console.log("Mock: Skipping signature verification");
        return await probot.webhooks.receive(probotArgs);
    } else {
        return await probot.webhooks.verifyAndReceive(probotArgs);
    }
};
