# infra

Terraform that manages the Vercel projects, domains, and env vars for PureType.

## What this manages

- `puretype-frontend` (SvelteKit + Capacitor) at `puretype.app`
- `puretype-backend` (Nitro) at `api.puretype.app`
- All backend runtime env vars (OpenAI, Vercel AI Gateway, Turso, Google/Apple OAuth, Telegram bot, session secret)
- Frontend build-time env vars (VITE_* — Google Maps key, OAuth client ids, Apple redirect URL)

Both projects are owned by the `elumixors-projects` Vercel team and connected to the `elumixor/eos` GitHub repo, production branch `main`.

## First-time setup

```bash
cp terraform.tfvars.example terraform.tfvars
# Fill in tokens + secrets (mirror /.env at the repo root).

terraform init
terraform plan      # should show "No changes" against a healthy environment
```

## Day-to-day

```bash
terraform plan      # show drift
terraform apply     # push changes to Vercel
```

Both `vercel_project` resources have `prevent_destroy = true`. To rename, replace, or migrate them, remove that block first, apply, then proceed.

## Variable values

Most variables are pulled from the repo root `.env` (which is symlinked into `apps/backend/.env` and `apps/frontend/.env`). Keep `terraform.tfvars` in sync with `.env` so local dev and Vercel use the same values.
