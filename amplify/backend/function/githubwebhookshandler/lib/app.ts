import { Probot } from "probot";

const app = (app: Probot) => {
  app.onAny((event) => console.log(`EVENT: ${JSON.stringify(event)}`));
};

export default app;
