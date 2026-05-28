variable "vercel_api_token" {
  description = "Vercel API token. Create at https://vercel.com/account/tokens."
  type        = string
  sensitive   = true
}

variable "vercel_team" {
  description = "Vercel team slug that owns the projects."
  type        = string
  default     = "elumixors-projects"
}

variable "github_token" {
  description = "GitHub PAT with repo scope on elumixor/eos."
  type        = string
  sensitive   = true
}

variable "github_owner" {
  description = "GitHub repo owner."
  type        = string
  default     = "elumixor"
}

variable "github_repo" {
  description = "GitHub repo name."
  type        = string
  default     = "eos"
}

# Sensitive runtime secrets for the backend. Set these in terraform.tfvars
# (gitignored) — terraform syncs them to the corresponding Vercel project.
variable "openai_api_key" {
  description = "OpenAI API key (used for audio transcription)."
  type        = string
  sensitive   = true
}

variable "vercel_ai_key" {
  description = "Vercel AI Gateway key (used for chat completions)."
  type        = string
  sensitive   = true
}

variable "turso_database_url" {
  description = "Turso libsql URL for the production database."
  type        = string
  sensitive   = true
}

variable "turso_auth_token" {
  description = "Turso auth token for the production database."
  type        = string
  sensitive   = true
}

variable "telegram_bot_token" {
  description = "Telegram bot token."
  type        = string
  sensitive   = true
}

variable "session_secret" {
  description = "Session signing secret."
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth web client ID."
  type        = string
  sensitive   = true
}

variable "google_ios_client_id" {
  description = "Google OAuth iOS client ID."
  type        = string
  sensitive   = true
  default     = ""
}

variable "apple_client_id" {
  description = "Apple Sign-In client ID (Service ID)."
  type        = string
  sensitive   = true
}

variable "apple_web_client_id" {
  description = "Apple Sign-In web client ID."
  type        = string
  sensitive   = true
  default     = ""
}

# Frontend-only build-time vars (must be present at `vite build`).
variable "vite_google_maps_api_key" {
  description = "Google Maps JS SDK key used by the frontend."
  type        = string
  sensitive   = true
}

variable "vite_apple_redirect_url" {
  description = "Apple Sign-In redirect URL — must also be registered in Apple Developer Console."
  type        = string
  default     = "https://puretype.app/auth/apple/callback"
}

variable "vite_api_url" {
  description = "Backend API URL baked into the frontend Vite bundle at build time."
  type        = string
  default     = "https://api.puretype.app"
}

variable "admin_emails" {
  description = "Comma-separated list of emails allowed to access /admin/*. Empty = nobody."
  type        = string
  default     = ""
}
