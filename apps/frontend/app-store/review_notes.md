# App Review Notes — Eos

## Demo account

No demo account required. Eos boots with an anonymous user automatically — the reviewer can create, complete, and reschedule tasks immediately without signing in. Sign-in via Google or Apple is reached through the avatar button in the top right of the home screen.

## Telegram sync

Eos can optionally receive tasks from a Telegram bot. The reviewer does not need to test this path — the bot integration runs on the backend and is enabled per-user from inside the app. The app is fully functional without it.

## Export compliance

`ITSAppUsesNonExemptEncryption` is set to `false` in `Info.plist`. Eos uses only standard HTTPS and Apple's built-in encryption.

## Contact

todoro.app.atma@gmail.com