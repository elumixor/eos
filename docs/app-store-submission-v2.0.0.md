# App Store Submission — PureType v2.0.0

Drop-in copy for App Store Connect.

## Version
2.0.0

## Category
- Primary: Productivity
- Secondary: Utilities

## Age rating
4+ — no objectionable content, no user-to-user messaging, no in-app purchases.

## Subtitle (30 char max)
Minimal todos. Just type.

## Promotional Text (170 char max — editable without re-review)
Stop choosing dates from pickers. Stop tagging tasks with menus. Type one line — gym tomorrow 9am 45min — and PureType structures it. That's the whole app.

## Description (4000 char max)
PureType is a todo app shaped like a notes app. Type one line, and your task is on the list. No date pickers, no project dropdowns, no settings tab full of toggles — just text that the app understands.

You write `gym tomorrow 9am 45min @health`. PureType reads it. The date, time, duration, and project become chips inline. You never leave the keyboard.

— JUST TEXT, RENDERED —
• Type any line, PureType extracts the date, time, duration, and project
• Chips render inline as you type — no separate forms
• Everything is one input field. That's the whole UI

— VOICE CAPTURE —
• Hold to talk, release to add — the app transcribes and parses in one step
• Same input model as typing — voice is just dictation into the text
• Audio is sent for transcription and immediately discarded

— OFFLINE-FIRST —
• Works without a connection — sync happens in the background
• Tasks appear instantly, no spinners on the input
• Local-first storage, cloud sync optional

— FOR PEOPLE WHO QUIT TODO APPS —
• No projects view, no calendar view, no kanban view
• No tags page, no settings labyrinth
• No methodology (no GTD, no PARA, no time-blocking dogma)
• If you've abandoned Things, Todoist, or TickTick because they got too heavy — this is built for you

PureType competes with Apple Notes and a text file, not with Things. The structure comes from what you type, not from menus you click through.

Start free. No subscription, no account required.

## Keywords (100 char max, comma-separated, no spaces)
todo,task,list,notes,minimal,plaintext,markdown,voice,planner,reminder,capture,adhd,focus,gtd

## Support URL
https://puretype.app/support

## Marketing URL
https://puretype.app

## Privacy Policy URL
https://puretype.app/privacy

## Terms of Service URL (EULA)
https://puretype.app/terms

## Copyright
© 2026 Atma Gaming

---

## App Review — Sign-In Information

**Sign-in required:** No (anonymous mode is the default)

### Username
*(leave blank — anonymous mode used)*

### Password
*(leave blank)*

### Notes for Reviewer
PureType supports anonymous use with no login required. On first launch the app auto-creates an anonymous account so the reviewer can immediately try the core flow:

1. The input field is at the bottom of the screen. Type `lunch with sam tomorrow 1pm @work` and tap return — observe that the date, time, and project render as inline chips.
2. Tap and hold the microphone button, say "buy groceries today 6pm", release — the spoken text is transcribed, parsed into chips, and added to the list in one step.
3. Swipe a task left to archive it. Open the Archive screen from the header to restore.
4. Tap any task to edit it inline.
5. The Settings screen has theme toggle, optional sign-in, and account deletion. Nothing else.

Sign-in (Google or Apple) is OPTIONAL and only used to sync tasks across devices. It is NOT required to use any feature of the app.

Voice capture uses the microphone only while the reviewer holds the microphone button — never in the background, never without explicit user action. Audio is sent to our backend at https://api.puretype.app and routed through the Vercel AI Gateway to Google Gemini for transcription. The audio is discarded after the transcript returns. No audio is stored.

Contact: support@puretype.app

---

## Privacy nutrition labels

| Data type | Used for | Linked to user | Tracking |
|---|---|---|---|
| Email Address | App Functionality | Yes | No |
| User ID | App Functionality | Yes | No |
| User Content (tasks, voice transcripts) | App Functionality | Yes | No |
| Audio Data | App Functionality | No | No |
| Crash Data | App Functionality | No | No |

**Tracking:** none. No third-party analytics, no advertising identifiers.

**Third-party SDKs disclosed:**
- Sign in with Apple (authentication)
- Google Sign-In via @capgo/capacitor-social-login (authentication)

**Server-side processing disclosed in description and privacy policy:**
- Vercel AI Gateway → Google Gemini API (voice transcription — audio is discarded after transcription, never stored)
- Turso (hosted database for task sync)

---

## Pre-submission checklist

- [x] App renamed to "PureType" in `capacitor.config.ts`, iOS `capacitor.config.json`, `Info.plist`, and Xcode project
- [x] Bundle ID: `app.puretype`
- [x] Domain `puretype.app` live
- [x] Marketing landing page live at https://puretype.app
- [x] Privacy policy live at https://puretype.app/privacy (`apps/frontend/src/routes/privacy/+page.svelte`)
- [x] Terms of service live at https://puretype.app/terms (`apps/frontend/src/routes/terms/+page.svelte`)
- [x] Support page live at https://puretype.app/support (`apps/frontend/src/routes/support/+page.svelte`)
- [x] No in-app purchases on iOS in this version
- [ ] Sign in with Apple wired (required by Apple when Google Sign-In is present)
- [ ] Account deletion path verified: Settings → Delete account
- [ ] Anonymous flow tested on a clean device end-to-end
- [ ] Screenshots taken with seeded data, no debug overlays
- [ ] Voice capture works with mic permission on first request
- [ ] Listing copy claims only features that ship in v2.0.0
- [ ] All listing URLs resolve with real rendered content (re-check after deploy)
- [ ] Export compliance: `ITSAppUsesNonExemptEncryption = false` in Info.plist

---

## Character counts

| Field | Length | Limit | Status |
|---|---|---|---|
| App name (PureType) | 8 | 30 | ✅ |
| Subtitle | 25 | 30 | ✅ |
| Promotional Text | 163 | 170 | ✅ |
| Description | ~1750 | 4000 | ✅ |
| Keywords | 93 | 100 | ✅ |

---

## What changed from v1.0

- Bumped to **2.0.0** (matches `MARKETING_VERSION` in the Xcode project).
- Removed "location" claim from the description — only date, time, duration, project are extracted today.
- Added **Terms of Service URL** as a separate field (Apple lists this as the EULA field in App Store Connect).
- Updated voice-transcription wording to match the actual backend path (Vercel AI Gateway → Gemini, not direct Gemini).
- Privacy/Terms/Support routes now exist as real SvelteKit pages in `apps/frontend/src/routes/`.

## TODOs before submitting

1. After deploying the frontend, re-curl `puretype.app/privacy`, `/terms`, `/support` and confirm rendered headings show up (not just the SPA shell).
2. Wire **Sign in with Apple** — Apple rejects apps offering Google Sign-In without it.
3. Take fresh screenshots for the 2.0 listing (run `/appstore-prep` if you want it scripted).
4. Confirm `ITSAppUsesNonExemptEncryption` is set in `Info.plist`.
