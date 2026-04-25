import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as amplify from "aws-cdk-lib/aws-amplify";

export interface FrontendStackProps extends cdk.StackProps {
  stage: string;
  backendApiUrl: string;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const stage = props.stage;

    const repository = new cdk.CfnParameter(this, "FrontendRepository", {
      type: "String",
      default: "https://github.com/Paloor/paloor_frontend",
      description: "Git repository URL for the frontend app.",
    });

    const githubPat = new cdk.CfnParameter(this, "GitHubPersonalAccessToken", {
      type: "String",
      noEcho: true,
      description:
        "GitHub Personal Access Token used by Amplify to connect to the repository.",
    });

    const branchName = new cdk.CfnParameter(this, "FrontendBranch", {
      type: "String",
      default: "main",
      description: "Git branch to deploy.",
    });

    const app = new amplify.CfnApp(this, "FrontendAmplifyApp", {
      name: `paloor-frontend-${stage}`,
      repository: repository.valueAsString,
      accessToken: githubPat.valueAsString,
      platform: "WEB_COMPUTE",
      enableBranchAutoDeletion: true,
      environmentVariables: [
        {
          name: "NEXT_PUBLIC_API_URL",
          value: props.backendApiUrl,
        },
      ],
      buildSpec: [
        "version: 1",
        "frontend:",
        "  phases:",
        "    preBuild:",
        "      commands:",
        "        - npm ci",
        "    build:",
        "      commands:",
        "        - npm run build",
        "  artifacts:",
        "    baseDirectory: .next",
        "    files:",
        "      - '**/*'",
        "  cache:",
        "    paths:",
        "      - node_modules/**/*",
      ].join("\n"),
    });

    const branch = new amplify.CfnBranch(this, "FrontendMainBranch", {
      appId: app.attrAppId,
      branchName: branchName.valueAsString,
      enableAutoBuild: true,
      stage: "PRODUCTION",
      framework: "Next.js - SSR",
    });

    new cdk.CfnOutput(this, "AmplifyAppId", {
      value: app.attrAppId,
      description: "Amplify app id for frontend.",
    });

    new cdk.CfnOutput(this, "AmplifyDefaultDomain", {
      value: app.attrDefaultDomain,
      description: "Default Amplify domain. URL format: https://<branch>.<domain>",
    });

    new cdk.CfnOutput(this, "AmplifyBranchName", {
      value: branch.branchName ?? branchName.valueAsString,
      description: "Amplify branch deployed for frontend.",
    });
  }
}

