# Paloor Infrastructure (AWS CDK)

CDK application for provisioning Paloor cloud resources with separate stacks for frontend and backend.

## Recommended Hosting (Low/No Users)

### Frontend

- **AWS Amplify Hosting (WEB_COMPUTE)** for Next.js.
- Why:
  - Lowest operational overhead
  - Built-in CI/CD from Git repository
  - Good fit for early-stage traffic

### Backend

- **AWS App Runner** for FastAPI container.
- Why:
  - Managed container runtime (minimal ops)
  - Simple deploy flow from ECR image
  - Easy to scale later as traffic increases

### Backend Supporting Resources

- **S3 bucket** for uploads/documents
- **Secrets Manager** for app runtime secrets/config
- **CloudWatch** logs/metrics (native with App Runner)

## Current Stack Layout

- `PaloorFrontendStack-<stage>`
  - Amplify App + Branch deployment
  - Injects `NEXT_PUBLIC_API_URL` from backend stack output

- `PaloorBackendStack-<stage>`
  - App Runner service (container image URI parameterized)
  - S3 uploads bucket
  - Secrets Manager app config secret

## Project Structure

```text
bin/
  paloor-infra.ts       # CDK app entrypoint
lib/
  backend-stack.ts      # Backend infrastructure
  frontend-stack.ts     # Frontend infrastructure
```

## Prerequisites

- Node.js 20+
- AWS CLI configured
- AWS CDK bootstrap completed in target account/region

## Setup

```bash
npm install
npm run build
```

## Bootstrap (one-time per account/region)

```bash
npx cdk bootstrap
```

## Synthesize

```bash
npm run synth -- -c stage=dev
```

## Deploy

Deploy both stacks:

```bash
npm run deploy -- -c stage=dev --all
```

Deploy backend only:

```bash
npm run deploy -- -c stage=dev PaloorBackendStack-dev
```

Deploy frontend only:

```bash
npm run deploy -- -c stage=dev PaloorFrontendStack-dev
```

## Required Deployment Parameters

Frontend stack expects:

- `FrontendRepository` (Git repo URL)
- `GitHubPersonalAccessToken` (PAT for Amplify repo access)
- `FrontendBranch` (usually `main`)

Backend stack expects:

- `BackendImageUri` (ECR image URI for backend container)

You can pass these via `--parameters` during deploy.

## Notes

- Current setup optimizes for speed + low operations at low traffic.
- If you require robust WebSocket support at scale, move backend hosting to ECS Fargate + ALB in a future iteration.
