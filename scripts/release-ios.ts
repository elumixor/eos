#!/usr/bin/env bun
import { $ } from "bun";
import { resolve } from "path";

const arg = process.argv[2] ?? "patch";
const repoRoot = resolve(import.meta.dir, "..");
const iosAppDir = resolve(repoRoot, "apps/frontend/ios/App");

const current = (await $`xcrun agvtool what-marketing-version -terse1`.cwd(iosAppDir).text()).trim();
const match = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!match) throw new Error(`Cannot parse current marketing version: ${current}`);
const [major, minor, patch] = match.slice(1).map(Number);

let next: string;
if (arg === "patch") next = `${major}.${minor}.${patch + 1}`;
else if (arg === "minor") next = `${major}.${minor + 1}.0`;
else if (arg === "major") next = `${major + 1}.0.0`;
else if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else throw new Error(`Unknown bump: ${arg}. Use patch|minor|major|<x.y.z>`);

const tag = `ios-v${next}`;

const dirty = (await $`git status --porcelain`.cwd(repoRoot).text()).trim();
if (dirty) throw new Error("Working tree not clean — commit or stash first.");

const existing = (await $`git tag -l ${tag}`.cwd(repoRoot).text()).trim();
if (existing) throw new Error(`Tag ${tag} already exists.`);

console.log(`Bumping ${current} → ${next}`);

await $`xcrun agvtool new-marketing-version ${next}`.cwd(iosAppDir);
await $`git add apps/frontend/ios/App/App.xcodeproj/project.pbxproj apps/frontend/ios/App/App/Info.plist`.cwd(repoRoot);
await $`git commit -m ${`release(ios): v${next}`}`.cwd(repoRoot);
await $`git tag ${tag}`.cwd(repoRoot);
await $`git push`.cwd(repoRoot);
await $`git push origin ${tag}`.cwd(repoRoot);

console.log(`✓ pushed ${tag}`);
