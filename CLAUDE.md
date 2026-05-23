# EOS — Claude Instructions

## iOS Releases

To ship a new TestFlight build, run from repo root:

```bash
bun run release             # auto-bumps patch (default)
bun run release minor       # 1.0.3 → 1.1.0
bun run release major       # 1.0.3 → 2.0.0
bun run release 1.2.0       # explicit version
```

This reads the current `MARKETING_VERSION` from the iOS project, bumps it, commits, creates an `ios-v<version>` git tag, and pushes both. The `.github/workflows/ios-testflight.yml` workflow triggers on `ios-v*` tags and uploads the build to TestFlight via fastlane. The build number (`CFBundleVersion`) is auto-incremented inside the workflow off the latest TestFlight number — never manually bumped.

Do not add a `workflow_dispatch` trigger. Releases must go through the `release` script so the tag/version history is consistent.
