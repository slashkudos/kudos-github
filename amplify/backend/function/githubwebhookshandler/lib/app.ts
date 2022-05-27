import { Probot } from "probot";

export = (app: Probot) => {
  app.onAny((event) => console.log(`EVENT: ${JSON.stringify(event)}`));
};
