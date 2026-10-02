# HA Calendar Picker — Design & Planning Notes

Design decisions, alternatives considered, and rationale behind key implementation choices.

---

## Purpose

A single-file, no-build-step Lovelace card that turns any Home Assistant Local Calendar entity into an interactive date picker. The primary use case is scheduling recurring days (e.g. watering, bin collection) and driving automations via the built-in calendar condition.

---

## Architecture: single JS file, no build step

The entire card lives in `dist/ha-calendar-picker.js`. There is no bundler, no transpiler, no `package.json`.

**Why:** HACS front-end cards need one deliverable file. Adding a build step would complicate contributions and the release process without meaningful benefit for a card of this size. Shadow DOM is used for style encapsulation in lieu of CSS modules or scoped styles.

---

## Event creation: midnight-to-midnight

Events are created spanning `00:00:00` on the selected day to `00:00:00` on the following day.

**Why:** The Home Assistant calendar condition evaluates whether an event is currently active. A truly all-day event (using `start.date` rather than `start.dateTime`) is not reliably caught by the condition in all HA versions. Midnight-to-midnight `dateTime` events ensure the entity state is `on` for the entire day, which is what automations need.

---

## Event deletion: runtime auto-detection

The card checks at runtime which delete service is available and uses the first that exists:

1. `calendar.delete_event` — the native HA action (works with Google Calendar etc.)
2. `calendar_utils.delete_event_by_uid` — fallback for Local Calendar via the Calendar Utils HACS integration
3. If neither is present, a clear error message is surfaced pointing the user to Calendar Utils

**Why:** The Local Calendar integration has never exposed a native delete-event action (confirmed as of HA 2026.3). Rather than hard-coding a dependency on Calendar Utils, the card probes `hass.services` at runtime so it works out of the box with any calendar integration that does support native deletion, and degrades gracefully with a meaningful error for those that don't.

---

## UID handling

Event UIDs are fetched via the REST API (`/api/calendars/<entity>`) and cached in `_eventMap` keyed by date string. If a UID is missing from the map when a delete is attempted, `_queryUid()` performs a targeted re-fetch for that single day before giving up.

**Why:** The Lovelace `hass.states` object does not expose event UIDs — only entity state. The REST API returns full event objects including `uid`/`id`. Caching avoids repeated API calls; the re-fetch fallback handles edge cases where the map is stale (e.g. after an external calendar change).

---

## Optimistic UI

Day toggles are applied to local state immediately (before the HA service call completes). If the call fails, the change is reverted and an error is shown.

**Why:** Service calls to HA can take several hundred milliseconds. Without optimistic updates the card would feel unresponsive — the user clicks a day and nothing happens until the round-trip completes. Reverting on error keeps the UI consistent with actual HA state.

---

## State update: atomic swap in `_fetchEvents`

When the API response arrives, `_selectedDays` and `_eventMap` are rebuilt into new local variables (`newSelected`, `newMap`) and swapped in together at the end.

**Why:** Updating the sets in-place mid-loop would cause a partial render if `_render()` were triggered between iterations. The atomic swap means the card either shows the old state or the fully-loaded new state — no empty-flash or half-loaded grid.

---

## Event listeners: single delegated click on the grid

One `click` listener is attached to the grid `<div>`, using `e.target.closest(".day[data-date]")` to identify which cell was clicked.

**Why:** Attaching individual listeners to each day cell (up to 31 per month) and then tearing them down on every `_render()` call would be wasteful. A single delegated listener on the stable grid container handles all cells and survives re-renders automatically.

---

## CSS theming: `--hcp-accent` + `color-mix()`

The accent colour is set as a single CSS custom property (`--hcp-accent`) via an inline style on `<ha-card>`. All derived tones (hover states, shadows, badges) are computed with `color-mix(in srgb, var(--hcp-accent) N%, ...)`.

**Why:** This lets users supply any hex colour in config without the card needing to pre-compute a palette in JavaScript. `color-mix()` is supported in all modern browsers and keeps the colour logic entirely in CSS where it belongs.

---

## Dependencies

### Calendar Utils

Required for Local Calendar delete support. It is not in the main HACS catalogue and must be added as a custom repository, then also added via **Settings → Devices & Services**.

The card surfaces a specific, actionable error message if the integration is missing, rather than silently failing.

### No other runtime dependencies

No external JS libraries. The Google Fonts import (`DM Sans`) is the only network request, and it is cosmetic — the card degrades to system sans-serif if the font fails to load.

---

## HACS & versioning

- `hacs.json` sets `render_readme: true` so the README is shown on the HACS detail page
- Versions are driven by GitHub Releases with semver tags (e.g. `v1.0.1`). Without a release, HACS falls back to displaying the 7-character commit SHA
- The resource URL is `/local/ha-calendar-picker.js`. Cache-busting on updates is done by appending a query string (e.g. `?v=2`) — documented in the README troubleshooting section

---

## Configuration options summary

| Option | Default | Notes |
|--------|---------|-------|
| `entity` | required | Calendar entity ID |
| `title` | `"Schedule"` | Card header |
| `icon` | `"📅"` | Emoji on selected days |
| `event_summary` | `"<icon> <title>"` | Stored as the HA event summary |
| `accent_color` | `"#4dc98a"` | Hex; drives all derived CSS colours |
| `show_summary_bar` | `true` | Upcoming-dates strip at the bottom |
| `summary_title` | `"Upcoming <title>"` | Strip label |
| `allow_past` | `false` | Whether past days are clickable |
