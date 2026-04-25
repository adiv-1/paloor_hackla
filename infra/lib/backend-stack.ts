import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export interface BackendStackProps extends cdk.StackProps {
  stage: string;
}

export class BackendStack extends cdk.Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    const stage = props.stage;

    const backendImageUri = new cdk.CfnParameter(this, "BackendImageUri", {
      type: "String",
      default: "public.ecr.aws/nginx/nginx:stable",
      description:
        "Container image URI for the backend service (replace with your ECR image URI).",
    });

    const uploadsBucket = new s3.Bucket(this, "UploadsBucket", {
      bucketName: `paloor-uploads-${this.account}-${this.region}-${stage}`.toLowerCase(),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const appConfigSecret = new secretsmanager.Secret(this, "BackendAppConfigSecret", {
      secretName: `paloor/${stage}/backend/app-config`,
      description: "Runtime config placeholder secret for Paloor backend.",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          JWT_SECRET_KEY: "replace-me",
          ALPHA_VANTAGE_API_KEY: "",
          GEMINI_API_KEY: "",
          GMAIL_ADDRESS: "",
          GMAIL_APP_PASSWORD: "",
          DATABASE_URL: "",
        }),
        generateStringKey: "RANDOM_PLACEHOLDER",
      },
    });

    const imageAccessRole = new iam.Role(this, "AppRunnerImageAccessRole", {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSAppRunnerServicePolicyForECRAccess",
        ),
      ],
    });

    const instanceRole = new iam.Role(this, "AppRunnerInstanceRole", {
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
    });

    uploadsBucket.grantReadWrite(instanceRole);
    appConfigSecret.grantRead(instanceRole);

    const service = new apprunner.CfnService(this, "BackendService", {
      serviceName: `paloor-backend-${stage}`,
      sourceConfiguration: {
        autoDeploymentsEnabled: false,
        authenticationConfiguration: {
          accessRoleArn: imageAccessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: backendImageUri.valueAsString,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "8000",
            runtimeEnvironmentVariables: [
              { name: "APP_ENV", value: stage },
              { name: "UPLOAD_BUCKET", value: uploadsBucket.bucketName },
              { name: "APP_CONFIG_SECRET_ARN", value: appConfigSecret.secretArn },
              { name: "DEBUG", value: "true" },
            ],
          },
        },
      },
      healthCheckConfiguration: {
        protocol: "HTTP",
        path: "/",
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      instanceConfiguration: {
        cpu: "1024",
        memory: "2048",
        instanceRoleArn: instanceRole.roleArn,
      },
    });

    this.apiUrl = `https://${service.attrServiceUrl}`;

    new cdk.CfnOutput(this, "BackendServiceUrl", {
      value: this.apiUrl,
      description: "Public URL for the backend App Runner service.",
    });

    new cdk.CfnOutput(this, "UploadsBucketName", {
      value: uploadsBucket.bucketName,
      description: "S3 bucket used for backend uploads.",
    });

    new cdk.CfnOutput(this, "BackendConfigSecretArn", {
      value: appConfigSecret.secretArn,
      description: "Secrets Manager ARN containing backend app config.",
    });
  }
}

