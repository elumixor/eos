provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.vercel_team
}

provider "github" {
  token = var.github_token
  owner = var.github_owner
}
