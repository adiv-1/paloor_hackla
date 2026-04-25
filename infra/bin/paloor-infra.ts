#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
// import { BackendStack } from "../lib/backend-stack";
import { FrontendStack } from "../lib/frontend-stack";

const app = new cdk.App();

const stage = (app.node.tryGetContext("stage") as string) ?? "dev";
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

// Backend stack is intentionally disabled while we focus on frontend infra.
// Re-enable when backend deployment is needed.
// const backendStack = new BackendStack(app, `PaloorBackendStack-${stage}`, {
//   env,
//   stage,
// });

const backendApiUrl =
  (app.node.tryGetContext("backendApiUrl") as string) ?? "http://localhost:8000";

new FrontendStack(app, `PaloorFrontendStack-${stage}`, {
  env,
  stage,
  backendApiUrl,
});
