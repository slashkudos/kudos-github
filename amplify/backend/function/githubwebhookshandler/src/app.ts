import { Probot } from "probot";

exports.app = (app: Probot) => {
  app.onAny((event) => console.log(`EVENT: ${JSON.stringify(event)}`));
};
