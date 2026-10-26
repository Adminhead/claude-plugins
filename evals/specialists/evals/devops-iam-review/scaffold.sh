#!/usr/bin/env bash
# Eval scaffold: a small Terraform root module (AWS, ECS worker) with a change request that touches IAM.
# No credentials, no backend access: the eval session can only read files.
set -euo pipefail
mkdir -p infra
cat > infra/versions.tf <<'J'
terraform {
  required_version = ">= 1.9, < 2.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.70" }
  }
  backend "s3" {
    bucket         = "acme-tfstate"
    key            = "reports/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "acme-tflock"
  }
}
provider "aws" { region = "eu-west-1" }
J
cat > infra/s3.tf <<'J'
resource "aws_s3_bucket" "reports" {
  bucket = "acme-reports-prod"
}

resource "aws_s3_bucket" "uploads" {
  bucket = "acme-customer-uploads-prod"
}
J
cat > infra/secrets.tf <<'J'
resource "aws_secretsmanager_secret" "reports_db" {
  name = "reports/db-password"
}

resource "aws_secretsmanager_secret" "payments_api" {
  name = "payments/api-key"
}
J
cat > infra/iam.tf <<'J'
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "worker" {
  name               = "reports-worker"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy" "worker" {
  name = "reports-worker"
  role = aws_iam_role.worker.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.reports.arn}/*"
      }
    ]
  })
}
J
cat > infra/ecs.tf <<'J'
resource "aws_ecs_task_definition" "worker" {
  family                   = "reports-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  task_role_arn            = aws_iam_role.worker.arn
  execution_role_arn       = aws_iam_role.worker.arn
  container_definitions = jsonencode([{
    name  = "worker"
    image = "123456789012.dkr.ecr.eu-west-1.amazonaws.com/reports-worker:2.4.1"
  }])
}

resource "aws_ecs_service" "worker" {
  name            = "reports-worker"
  cluster         = "reports"
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 2
  launch_type     = "FARGATE"
  network_configuration {
    subnets = ["subnet-0a1b2c3d4e5f6a7b8"]
  }
}
J
cat > CHANGE.md <<'J'
# Change request: reports worker exports and secret access

The reports worker now writes CSV exports to `acme-reports-prod` under the `exports/` prefix, lists that prefix to
clean up old files, and reads the `reports/db-password` secret at start-up. Nothing else changes for it.

Proposed diff to `infra/iam.tf` (from the PR, not yet merged):

```hcl
 resource "aws_iam_role" "worker" {
-  name               = "reports-worker"
+  name               = "reports-worker-role"
   assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
 }

 resource "aws_iam_role_policy" "worker" {
   name = "reports-worker"
   role = aws_iam_role.worker.id
   policy = jsonencode({
     Version = "2012-10-17"
     Statement = [
       {
         Effect   = "Allow"
-        Action   = ["s3:GetObject", "s3:PutObject"]
-        Resource = "${aws_s3_bucket.reports.arn}/*"
+        Action   = ["s3:*", "secretsmanager:*"]
+        Resource = "*"
       }
     ]
   })
 }
```

The author says the wildcards are temporary so the deploy is not blocked again, and the role rename matches the new
naming standard.
J
cat > README.md <<'J'
# reports infra

Terraform for the reports worker (AWS account 123456789012, eu-west-1). State is in the `acme-tfstate` S3 bucket.
CI runs `terraform plan` on every PR and a protected job runs `apply` after merge. Nobody has local credentials.
J
git init -q && git add -A && git -c user.email=e@x -c user.name=e commit -qm init
