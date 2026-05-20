# App Review Information

The fields App Store Connect asks for under **App Review Information** when you submit a version. Layout matches what [`fastlane deliver`](https://docs.fastlane.tools/actions/deliver/) expects under `metadata/review_information/`.

| File | App Store Connect field |
| --- | --- |
| `first_name.txt` | Contact information → First name |
| `last_name.txt` | Contact information → Last name |
| `phone_number.txt` | Contact information → Phone number |
| `email_address.txt` | Contact information → Email |
| `demo_account_required.txt` | "Sign-in required" toggle (`true`/`false`) |
| `demo_user.txt` | Sign-in info → User name (leave empty if not required) |
| `demo_password.txt` | Sign-in info → Password (leave empty if not required) |
| `notes.txt` | Notes for the reviewer |

## TODO before submission

- Fill in `phone_number.txt` with a real phone number reachable during review. App Store Connect will not accept a submission without one.

## What about the older review_notes.md?

`../review_notes.md` is a higher-level human-readable summary; the files here are the machine-readable per-field values Fastlane uploads. They overlap intentionally — keep them in sync when you edit.