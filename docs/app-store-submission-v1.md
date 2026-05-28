# App Store Submission — PureType v1.0

Drop-in copy for App Store Connect.

## Version
1.0

## Category
- Primary: Productivity
- Secondary: Utilities

## Age rating
4+ — no objectionable content, no user-to-user messaging, no in-app purchases.

## Subtitle (30 char max)
Minimal todos. Just type.

## Promotional Text (170 char max — editable without re-review)
Stop choosing dates from pickers. Stop tagging tasks with menus. Type one line — gym tomorrow 9am 45min — and PureType structures it. That's the whole app.

## Description
PureType is a todo app shaped like a notes app. Type one line, and your task is on the list. No date pickers, no project dropdowns, no settings tab full of toggles — just text that the app understands.

You write `gym tomorrow 9am 45min @health`. PureType reads it. The date, time, duration, and project become chips inline. You never leave the keyboard.

— JUST TEXT, RENDERED —
• Type any line, PureType extracts the date, time, duration, project, location
• Chips render inline as you type — no separate forms
• Everything is one input field. That's the whole UI

— VOICE CAPTURE —
• Hold to talk, release to add — the app transcribes and parses in one step
• Same input model as typing — voice is just dictation into the text
• Background noise tolerated, no training required

— OFFLINE-FIRST —
• Works without a connection — sync happens in the background
• Tasks appear instantly, no spinners on the input
• Local-first storage, cloud sync optional

— FOR PEOPLE WHO QUIT TODO APPS —
• No projects view, no calendar view, no kanban view
• No tags page, no settings labyrinth
• No methodology (no GTD, no PARA, no time-blocking dogma)
• If you've abandoned Things, Todoist, TickTick because they got too heavy — this is built for you

PureType competes with Apple Notes and a text file, not with Things. The structure comes from what you type, not from menus you click through.

Start free. No subscription, no account required for v1.

## Keywords (100 char max, comma-separated)
todo,task,list,notes,minimal,plain text,markdown,voice,planner,reminder,capture,adhd,focus,gtd

## Support URL
https://puretype.app/support

## Marketing URL
https://puretype.app

## Privacy Policy URL
https://puretype.app/privacy

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
PureType supports anonymous use with no login required. On first launch the app auto-creates an anonymous account and pre-loads a few sample tasks so the reviewer can immediately try the core flow:

1. The input field is at the bottom of the screen. Type `lunch with sam tomorrow 1pm @work` and tap return — observe that the date, time, and project render as inline chips while you type.
2. Tap the microphone button, say "buy groceries today 6pm", release — the spoken text is transcribed, parsed into chips, and added to the list in one step.
3. Swipe a task left to archive it. Tap an archived task to restore.
4. Tap any task to edit it inline. Long-press to select multiple tasks at once.
5. The settings tab is intentionally minimal — only sign-in (optional) and account deletion live there.

Sign-in (Google or Apple) is OPTIONAL and only used to sync tasks across devices. It is NOT required to use any feature.

Voice capture uses the microphone only when the reviewer holds the microphone button — never in the background, never without explicit user action. Audio is sent to our backend at https://api.puretype.app for transcription via Google's Gemini API, then discarded. No audio is stored.

Contact: todoro.app.atma@gmail.com

---

## Privacy nutrition labels

| Data type | Used for | Linked to user | Tracking |
|---|---|---|---|
| Email Address | App Functionality | Yes | No |
| User ID | App Functionality | Yes | No |
| User Content (tasks, voice transcripts) | App Functionality | Yes | No |
| Audio Data | App Functionality | No | No |
| Crash Data | App Functionality | No | No |

**Tracking:** none.

**Third-party SDKs disclosed:**
- Sign in with Apple (authentication)
- Google Sign-In (authentication)

**Server-side processing disclosed in description:**
- Google Gemini API (voice transcription — audio is discarded after transcription, never stored)

---

## Pre-submission checklist

- [x] App renamed from "Eos" to "PureType" in `capacitor.config.ts`, iOS `capacitor.config.json`, `Info.plist` (CFBundleDisplayName), and Xcode project
- [x] Bundle ID updated: `com.atma.eos.app` → `app.puretype` (reverse-DNS of puretype.app)
- [ ] Domain `puretype.app` purchased (see `docs/pitch.md` § Name & Domain)
- [ ] Marketing landing page live at puretype.app
- [ ] Support page live at puretype.app/support
- [ ] Privacy policy live at puretype.app/privacy
- [ ] Terms of service live at puretype.app/terms
- [ ] No in-app purchases on iOS in v1
- [ ] Sign in with Apple wired (required by Apple when Google Sign-In is present)
- [ ] Account deletion path: Settings → Delete account
- [ ] Anonymous flow tested on a clean device end-to-end
- [ ] Screenshots taken with seeded data, no debug overlays
- [ ] Voice capture works with mic permission on first request
- [ ] Listing copy claims only features that ship in v1
- [ ] All four listing URLs resolve with real content
- [ ] Export compliance: `ITSAppUsesNonExemptEncryption = false` in Info.plist

---

## Character counts

| Field | Length | Limit | Status |
|---|---|---|---|
| App name (PureType) | 8 | 30 | ✅ |
| Subtitle | 25 | 30 | ✅ |
| Promotional Text | 163 | 170 | ✅ |
| Description | ~1640 | 4000 | ✅ |
| Keywords | 94 | 100 | ✅ |

## TODOs before submitting

1. Buy `puretype.app` (then verify URLs resolve)
2. Rebrand: rename app in Capacitor + Xcode + Info.plist
3. Build the landing page + privacy/terms (run `/appstore-prep` to scaffold these)
4. Generate screenshots (run `/appstore-prep`)
5. Update `MARKETING_VERSION` if shipping a different number than 1.0
