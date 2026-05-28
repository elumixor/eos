# infra

Terraform that manages the Vercel projects and backend env vars for Eos.

## First-time setup

```bash
cp terraform.tfvars.example terraform.tfvars
# fill in tokens + secrets (mirror apps/backend/.env)

terraform init
```

The `eos-backend` and `eos-frontend` projects already exist in Vercel, so
import them into state before applying:

```bash
terraform import vercel_project.backend  prj_G4WJy6VeO16Cj523JJzuY1U8OSS3
terraform import vercel_project.frontend <frontend-project-id>
```

(Get the frontend id with `cat ../apps/frontend/.vercel/project.json`.)

Env vars that already exist in Vercel (e.g. `VERCEL_AI_KEY` pushed via CLI)
must also be imported, or deleted via UI/CLI and recreated by terraform.
Import format:

```bash
terraform import vercel_project_environment_variable.backend_vercel_ai_key \
  <backend-project-id>/<env-var-id>
```

(Get env-var ids from `vercel env ls` inside `apps/backend/`.)

## Day-to-day

```bash
terraform plan      # show drift
terraform apply     # push changes to Vercel
```
