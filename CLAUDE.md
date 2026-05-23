# EOS — Claude Instructions

## iOS Releases

To ship a new TestFlight build, run from repo root:

```bash
bun run release:ios 1.0.2     # explicit semver
```

This bumps `MARKETING_VERSION` in the iOS project, commits, creates an `ios-v<version>` git tag, and pushes both. The `.github/workflows/ios-testflight.yml` workflow triggers on `ios-v*` tags and uploads the build to TestFlight via fastlane. The build number is auto-incremented inside the workflow off the latest TestFlight number — never manually bumped.

Do not add a `workflow_dispatch` trigger. Releases must go through the `release:ios` script so the tag/version history is consistent.
