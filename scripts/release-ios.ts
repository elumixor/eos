#!/usr/bin/env bun
import { $ } from "bun";
import { resolve } from "path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: bun run release:ios <version>  (e.g. 1.0.2)");
  process.exit(1);
}

const tag = `ios-v${version}`;
const repoRoot = resolve(import.meta.dir, "..");
const iosAppDir = resolve(repoRoot, "apps/frontend/ios/App");

const dirty = (await $`git status --porcelain`.cwd(repoRoot).text()).trim();
if (dirty) throw new Error("Working tree not clean — commit or stash first.");

const existing = await $`git tag -l ${tag}`.cwd(repoRoot).text();
if (existing.trim()) throw new Error(`Tag ${tag} already exists.`);

await $`xcrun agvtool new-marketing-version ${version}`.cwd(iosAppDir);
await $`git add apps/frontend/ios/App/App.xcodeproj/project.pbxproj apps/frontend/ios/App/App/Info.plist`.cwd(repoRoot);
await $`git commit -m ${`release(ios): v${version}`}`.cwd(repoRoot);
await $`git tag ${tag}`.cwd(repoRoot);
await $`git push`.cwd(repoRoot);
await $`git push origin ${tag}`.cwd(repoRoot);

console.log(`✓ pushed ${tag} — watch the run: gh run watch -R $(gh repo view --json nameWithOwner -q .nameWithOwner) --workflow ios-testflight.yml`);
