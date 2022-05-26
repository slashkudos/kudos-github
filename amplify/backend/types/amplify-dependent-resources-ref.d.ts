export type AmplifyDependentResourcesAttributes = {
  function: {
    githubwebhookshandler: {
      Name: "string";
      Arn: "string";
      Region: "string";
      LambdaExecutionRole: "string";
    };
  };
  api: {
    github: {
      RootUrl: "string";
      ApiName: "string";
      ApiId: "string";
    };
  };
};
