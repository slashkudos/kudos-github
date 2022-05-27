import { Probot } from "probot";

export default (app: Probot) => {
  app.onAny((event) => console.log(`EVENT: ${JSON.stringify(event)}`));
};
