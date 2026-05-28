# Pitch

## Positioning

**It's just text. The text is the app.**

Everything else (chips, dates, projects, voice, future Telegram sync) is just *rendering* of plain text you already wrote. We're not adding features — we're adding *interpretations* of one input. The user writes one line. The app figures out the rest.

Closest mental model isn't a todo app, it's **Markdown for tasks**. Markdown is "just text" but renders to structure. We do the same thing for intent: `gym tomorrow 9am @health 45min` is the file, the chips are the render.

## Why this works

- **No feature creep guilt.** Adding Telegram sync isn't bloat — it's just another input surface for the same text. Voice isn't a feature — it's dictation into the text. AI parse isn't a feature — it's a better renderer. The core stays one textarea forever.
- **It defends the minimalism.** Competitors can't copy this without rewriting their data model. Things stores a Task object with fields. We store a string. That's a structural moat, not a UX one.
- **It gives power users a ceiling.** "Just text" sounds limiting until they realize they can write `every monday @work 30min` and it just works. Floor is low, ceiling is invisible.

## Category

**A todo app shaped like a notes app.**

Notes wins on friction, todo apps win on structure. We're the only one that doesn't pick.

We don't compete with Things, TickTick, Todoist. We compete with **Apple Notes, a text file, and the back of an envelope**. Those win on minimalism but lose on structure. Existing todo apps win on structure but lose on friction. We sit in the gap because the structure is *inferred from what you say/type*, not built via UI.

## Target user

Someone who already abandoned 3 todo apps because logging a task takes longer than doing it. They went back to Apple Notes or a text file. They'll pay for friction removal, not for aesthetics or methodology.

Not GTD people. Not PARA people. Not bullet-journal people. People who just want the list to exist.

## Taglines (draft)

- "Your todos are just text."
- "One line. That's the whole app."
- "Write it like you'd say it."
- "Plain text, smart list."

## What we will not add

A changelog of refusals is more interesting than one of new features. Things to keep saying no to:

- Projects view, calendar view, kanban view, tags page
- Settings tab full of toggles
- Methodologies (GTD, PARA, time-blocking dogma)
- Date pickers, project dropdowns, duration fields — anything that replaces typing with clicking

## Roadmap interpretations (not features)

All of these are the same text being rendered or ingested differently:

- Voice mode → dictation into the text
- AI parsing → smarter renderer (A/B test before committing)
- Telegram sync → another input surface for the same text
- Chips for `@project`, dates, locations, durations → already the render layer
