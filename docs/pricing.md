# Pricing — PureType

Captured working position. Final decision is gated on 2–4 weeks of post-launch
analytics — see "Decision criteria" below.

## Tiers

| | Free | Pro |
|---|---|---|
| Text capture | unlimited | unlimited |
| Sync across devices | unlimited | unlimited |
| Voice capture | **10 / day** | unlimited |
| Future Telegram input | ✅ | ✅ |
| Future AI features (smart-bucket, weekly recap, agent edits) | — | ✅ |

**Pro pricing:** $3.99 / month or $29 / year (39% yearly discount).

## Why this shape

- **Free is fully usable.** The pitch is "the text is the app" — gating text
  capture or sync paywalls the core loop and breaks the minimalism story.
- **Voice is the only paywall that earns its keep.** It has real per-call
  marginal cost (Gemini ≈ $0.001–$0.005 per transcription), so capping it
  protects unit economics without compromising the value prop for typists.
- **10/day is generous for casual users**, restrictive for heavy users.
  That's exactly the segment whose willingness-to-pay we should test.
- **$3.99/mo is the no-thought-required price.** Calibration:
  - Things: $49.99 one-time iOS
  - Todoist: ~$4/mo
  - TickTick: ~$3/mo
  Below $3 reads disposable; above $5 invites feature comparison against
  Todoist, which we'd lose because our moat is *not having* those features.

## Alternatives considered

### One-time IAP ($14.99 or $24.99 lifetime)

On-brand for the anti-SaaS feel. Loses recurring revenue, carries voice cost
forever on payers, and App Store one-time IAP is harder to discount or
re-engage. Only viable if we commit to no server-side AI features beyond
voice transcription. **Defensible but high-conviction call** — revisit at
Stage 3 if subscription churn turns out to be brutal.

### Ad-supported free

Hard no. Ads in a todo app destroy minimalism.

### Tier the cap instead of features (10 → 50 → ∞)

Three tiers split conversion and add UI complexity for marginal revenue.
Two tiers is the right granularity for v1.

## Decision criteria — when do we actually ship StoreKit?

We launch v2.0.0 without monetization. We turn on Pro when **all four** are
true:

1. **≥ 200 weekly active users** (so any A/B has signal).
2. **Voice-usage distribution is known.** The internal `/admin` view shows
   the histogram of voice calls per user per day. If the p90 is ≤ 10, the
   free cap is barely binding and we expect low conversion (set
   expectations); if p50 is > 10, the cap drives meaningful conversion and
   we should rate-limit gracefully (banner, not silent failure).
3. **AI cost per user per month is stable.** Calculated from
   `voice_used` event count × Gemini list price. Goal: free-tier cost
   < $0.30/user/mo (a fraction of expected Pro ARPU after Apple's 30%).
4. **StoreKit products configured in App Store Connect** — set up the
   subscription product weeks ahead of the in-app toggle so review and
   pricing rollout don't bottleneck the launch.

## Trial / launch tactic

When we flip Pro on, **first 90 days of every account are Pro**, with no
credit card required. After 90 days, falls back to Free unless they
subscribe. This converts the "I depend on this now" feeling into the
subscribe action without an upfront-payment barrier.

## Open questions (not blocking)

- Lifetime founders' tier ($49 once, while Free + Pro exist) — small,
  loud, supportive cohort early on. Decide after first paywall A/B.
- Family / shared-list pricing — only relevant once shared lists ship
  (Stage 3).
- Telegram input as Pro vs. Free — leans Free because it's still "just
  another input surface" and matches the pitch.

## Related

- Pitch / positioning: [docs/pitch.md](pitch.md)
- Roadmap: [docs/roadmap.md](roadmap.md)
- Analytics: events fired by the backend power every metric the admin view
  needs — see `apps/backend/src/services/analytics.ts` and grep `trackEvent(`.
