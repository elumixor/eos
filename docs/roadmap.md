# Roadmap — PureType

High-level only. Detailed work lives in GitHub issues, labelled `stage-0`, `stage-1`, etc.

## Where we are

**Stage 1 — Real users.** Shipping `v2.0.0` to TestFlight after the rebrand
from Eos. Anonymous-first flow works; Google + Apple sign-in wired; sync,
voice, archive, projects, tokens all in place. Privacy / Terms / Support
routes live, ImprovMX forwards `support@puretype.app` to the inbox, account
deletion + ToS disclaimer in Settings, analytics events firing
(`signup_anonymous`, `signup`, `signin`, `task_created`, `task_completed`,
`voice_used`, `voice_failed`, `account_deleted`).

## Stage 0 — MVP ✅

The core loop validated locally and in TestFlight under the `Eos` brand.
Type-or-voice → parsed task. Archive on swipe. Offline-first sync.

## Stage 1 — Real users (in progress)

| | Status |
|---|---|
| Rebrand to PureType, `app.puretype` bundle id | ✅ |
| Production domain (`puretype.app`) + DNS | ✅ |
| Anonymous + Google + Apple sign-in | ✅ |
| Offline-first sync (pull/push) | ✅ |
| Voice capture (Gemini via Vercel AI Gateway) | ✅ |
| Privacy / Terms / Support pages | ✅ |
| `support@` email forwarding (ImprovMX) | ✅ |
| Account deletion + ToS disclaimer | ✅ |
| `AnalyticsEvent` table + `trackEvent()` helper | ✅ |
| Sentry / error tracking | ⏳ deferred until first triage need |
| Internal `/admin` dashboard (DAU, funnel, AI cost) | ⏳ next |
| App Store screenshots + v2.0.0 listing copy | ⏳ next |
| Sign in with Apple confirmed end-to-end | ✅ |
| Manual QA on clean device (anonymous → sign-in flow) | ⏳ next |

**Exit criteria:** TestFlight build live, first 50 invited users can sign up,
create tasks (text + voice), and the daily query
`SELECT event, count(*) FROM "AnalyticsEvent" GROUP BY event, DATE(createdAt)`
returns usable funnel data.

## Stage 2 — Scale & polish

- Performance pass (cold-start, sync push throughput)
- Internal `/admin` analytics dashboard (DAU, funnel, per-user AI cost)
- Sentry on backend + frontend
- A/B framework for description-render variants (LLM vs. regex token parser)
- Marketing landing page with real screenshots / video
- Monetization: see `docs/pricing.md` (TBD)
- Android beta

## Stage 3 — Growth

- Telegram input surface (the bot already exists; surface in onboarding)
- Calendar / Google Calendar two-way sync (read-only first)
- Shared lists (single shared project between two accounts)
- Web app polish for desktop power users
- Referrals — invite gets one free month each

## Non-goals (per `docs/pitch.md`)

Projects view, calendar view, kanban view, tags page, settings tab full of
toggles, methodology dogma (GTD/PARA), date pickers, project dropdowns,
duration fields.
