locals {
  github_full = "${var.github_owner}/${var.github_repo}"
}

resource "vercel_project" "backend" {
  name      = "puretype-backend"
  framework = "nitro"

  root_directory   = "apps/backend"
  build_command    = "bun run build"
  install_command  = "bun install"
  output_directory = ".output"

  git_repository = {
    type              = "github"
    repo              = local.github_full
    production_branch = "main"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "vercel_project" "frontend" {
  name      = "puretype-frontend"
  framework = "sveltekit"

  root_directory  = "apps/frontend"
  build_command   = "bun run build"
  install_command = "bun install"

  git_repository = {
    type              = "github"
    repo              = local.github_full
    production_branch = "main"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# --- Domain attached to the frontend project.
# puretype.app is registered on the elumixor Vercel account; attaching here.

resource "vercel_project_domain" "frontend_puretype" {
  project_id = vercel_project.frontend.id
  domain     = "puretype.app"
}

resource "vercel_project_domain" "backend_api_puretype" {
  project_id = vercel_project.backend.id
  domain     = "api.puretype.app"
}

# --- Backend env vars.

resource "vercel_project_environment_variable" "backend_openai_api_key" {
  project_id = vercel_project.backend.id
  key        = "OPENAI_API_KEY"
  value      = var.openai_api_key
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "backend_vercel_ai_key" {
  project_id = vercel_project.backend.id
  key        = "VERCEL_AI_KEY"
  value      = var.vercel_ai_key
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "backend_turso_database_url" {
  project_id = vercel_project.backend.id
  key        = "TURSO_DATABASE_URL"
  value      = var.turso_database_url
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "backend_turso_auth_token" {
  project_id = vercel_project.backend.id
  key        = "TURSO_AUTH_TOKEN"
  value      = var.turso_auth_token
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "backend_telegram_bot_token" {
  project_id = vercel_project.backend.id
  key        = "TELEGRAM_BOT_TOKEN"
  value      = var.telegram_bot_token
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "backend_session_secret" {
  project_id = vercel_project.backend.id
  key        = "SESSION_SECRET"
  value      = var.session_secret
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "backend_google_client_id" {
  project_id = vercel_project.backend.id
  key        = "GOOGLE_CLIENT_ID"
  value      = var.google_client_id
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "backend_google_ios_client_id" {
  count      = var.google_ios_client_id == "" ? 0 : 1
  project_id = vercel_project.backend.id
  key        = "GOOGLE_IOS_CLIENT_ID"
  value      = var.google_ios_client_id
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "backend_apple_client_id" {
  project_id = vercel_project.backend.id
  key        = "APPLE_CLIENT_ID"
  value      = var.apple_client_id
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "backend_apple_web_client_id" {
  count      = var.apple_web_client_id == "" ? 0 : 1
  project_id = vercel_project.backend.id
  key        = "APPLE_WEB_CLIENT_ID"
  value      = var.apple_web_client_id
  target     = ["production", "preview"]
  sensitive  = true
}

# --- Frontend build-time vars.
# These are baked into the Vite bundle at build time. The VITE_GOOGLE_*
# values intentionally mirror their backend counterparts (same OAuth client).

resource "vercel_project_environment_variable" "frontend_vite_google_maps_api_key" {
  project_id = vercel_project.frontend.id
  key        = "VITE_GOOGLE_MAPS_API_KEY"
  value      = var.vite_google_maps_api_key
  target     = ["production", "preview"]
  sensitive  = true
}

resource "vercel_project_environment_variable" "frontend_vite_google_web_client_id" {
  project_id = vercel_project.frontend.id
  key        = "VITE_GOOGLE_WEB_CLIENT_ID"
  value      = var.google_client_id
  target     = ["production", "preview"]
}

resource "vercel_project_environment_variable" "frontend_vite_google_ios_client_id" {
  count      = var.google_ios_client_id == "" ? 0 : 1
  project_id = vercel_project.frontend.id
  key        = "VITE_GOOGLE_IOS_CLIENT_ID"
  value      = var.google_ios_client_id
  target     = ["production", "preview"]
}

resource "vercel_project_environment_variable" "frontend_vite_apple_services_id" {
  count      = var.apple_web_client_id == "" ? 0 : 1
  project_id = vercel_project.frontend.id
  key        = "VITE_APPLE_SERVICES_ID"
  value      = var.apple_web_client_id
  target     = ["production", "preview"]
}

resource "vercel_project_environment_variable" "frontend_vite_apple_redirect_url" {
  project_id = vercel_project.frontend.id
  key        = "VITE_APPLE_REDIRECT_URL"
  value      = var.vite_apple_redirect_url
  target     = ["production", "preview"]
}
