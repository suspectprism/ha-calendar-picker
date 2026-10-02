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

No external JS libraries and no external network requests. The card inherits HA's theme font and colours. (Earlier versions imported DM Sans from Google Fonts. This was removed in the visual refresh.)

---

## HACS & versioning

- `hacs.json` sets `render_readme: true` so the README is shown on the HACS detail page
- Versions are driven by GitHub Releases with semver tags (e.g. `v1.0.1`). Without a release, HACS falls back to displaying the 7-character commit SHA
- The resource URL is `/local/ha-calendar-picker.js`. Cache-busting on updates is done by appending a query string (e.g. `?v=2`) — documented in the README troubleshooting section

---

## Planned changes

### Change 1 — Visual refresh (CSS only) — ✅ implemented, awaiting review in HA

Implementation notes (deviations/additions to the plan below):
- Past days: **no tile background**, and the date + watering indicator at 0.35 opacity, so they're just faint numbers. Future days keep their tile. In light mode the tile/no-tile difference is what makes past vs. future obvious; opacity alone wasn't enough. Past *watering* days keep a muted grey tile with the date + indicator at 0.6; at 0.3 they were near-invisible, which made history unreadable.
- Dimming is applied to the date and indicator only, not the whole cell, so corner data (observed rainfall in Change 2) stays at full strength on past days.
- Card title now follows the HA card-header look (1.25rem, primary text colour, normal case) instead of the small uppercase accent label. Summary-bar label uses secondary text colour.
- The DM Sans Google Fonts import was removed, so the card uses HA's own font like stock cards. This also removes the card's only external network request.
- Header wraps onto two lines (title, then month nav) on narrow phone widths.
- Hovering a selected day keeps its accent fill. Previously the hover style replaced it.
- Tested in a local harness with HA dark and light theme variables at 480px and 340px widths. The date position is unchanged through select → loading → deselect.

**Today circle vs. corners on phones — decided: D, implemented** (`dev/mockup.html`). A phone-width card (360px) has ~44px cells. The 1.9em today circle (26px) overlaps the watering indicator now, and would also overlap the forecast and actual rain values in Change 2. Measured clearance between the circle and each corner element (negative = overlap):

| Variant | Desktop (61px cells) | Phone (44px cells) |
|---------|------|-------|
| A: circle 1.9em, square cells (current) | 6–10px | **−5 to −2px** |
| B: circle 1.5em, square cells | 9–12px | **−2 to 0px** |
| C: circle 1.9em, cells 5:6 when narrow | 6–10px | −0.4 to 1.5px |
| D: circle 1.6em, cells 5:6 when narrow | 8–12px | **1.7–3.5px** ✓ |

"When narrow" uses a container query on the grid (`@container (max-width: 400px)`), so desktop cells stay square. D was chosen: circle 1.6em, and `aspect-ratio: 5 / 6` inside `@container (max-width: 400px)` on the grid.

Concerns, in priority order:

1. **Today is hard to distinguish from selected days.** Both currently use the accent colour (border + tint).
2. **Colour scheme doesn't match standard HA dark mode**, reducing contrast compared with stock cards.
3. **Past dates aren't dim enough.**

Plan:

- **Separate "today" and "selected" into different visual layers.**
  - *Selected* = whole-cell treatment (accent fill + border), unchanged in concept.
  - *Today* = day-number treatment: a solid filled circle behind the number using `--primary-text-color` with the number in `--card-background-color`. This is the Google/Apple calendar convention and stacks cleanly when today is also selected.
  - A neutral (white-on-dark) circle was chosen over HA's `--primary-color` blue, which was originally reserved for rainfall. Rainfall now uses the default text colour too (see Change 2), but the neutral circle still fits HA's look best.
- **Fixed date position; watering indicator in the top-left corner.**
  - Currently the date and the watering indicator (the configured `icon`) are a flex column centred as a group, so the date shifts up whenever a day is selected. With a today circle, that shift would be obvious.
  - The date is pinned to the exact centre of every cell. The watering indicator is absolutely positioned in the top-left corner, so toggling only shows or hides it. The date and today circle never move.
  - Considered: indicator on the same line as the date. Rejected because a centred group shifts the date on toggle, and an anchored date + circle + indicator is too wide for a ~45px phone cell.
  - Gives each region one job: top-left = watering, right column = rain (Change 2), centre = date.
- **Adopt HA theme variables** instead of hard-coded colours:
  - Remove the custom navy→green gradient; use `ha-card`'s default background.
  - Replace `#c8ede0` / `#e8f4f0` / `rgba(200,237,224,…)` with `--primary-text-color`, `--secondary-text-color`, `--divider-color`.
  - Keep `--hcp-accent` only for selection-related elements.
  - Side benefit: the card works in light mode too.
- **Dim past days further**: opacity 0.45 → ~0.3, and desaturate *selected* past days (grey border/fill, greyscale watering indicator) so history doesn't compete with upcoming days.

### Change 2 — Rainfall per day

Show observed rainfall on past days and today, and BoM forecast rainfall on today and the next 6 days.

#### Data sources

| Data | Entity | Notes |
|------|--------|-------|
| Observed (today, live) | `sensor.icanbe339_rainfall_today` | WU REST scrape every 5 min; daily total, resets at midnight; `state_class: total_increasing` |
| Observed (past days) | same sensor, via long-term statistics | See below |
| Forecast (days 0–6) | `sensor.phillip_rain_amount_min_N` / `_max_N` | [bremor/bureau_of_meteorology](https://github.com/bremor/bureau_of_meteorology); `N=0` is today |

**Past observed values** are fetched with the websocket call `recorder/statistics_during_period` (via `hass.callWS`) with `period: "day"` and `types: ["change"]`. Because the sensor is `total_increasing`, HA treats the midnight drop to 0 as a meter reset, so the daily `change` equals that day's rainfall. (`min`/`max`/`mean` statistics are only generated for `state_class: measurement`, so they're not available here.) Long-term statistics are generated automatically (the sensor has a `state_class` and unit) and kept indefinitely, unlike raw state history, which is purged after `purge_keep_days` (default 10). No helper or extra entities are needed, and browsing earlier months works. Data only exists from when `state_class` was first set. Check in Developer Tools → Statistics.

**Today's observed value** comes straight from `hass.states`. Statistics are compiled hourly and lag behind.

**Forecast values** come straight from `hass.states`, so they update reactively and need no API call. Each sensor has a `date` attribute (e.g. `2026-10-03T00:00:00+10:00`). The card maps forecasts to calendar days using `date.slice(0, 10)`, not the `_N` index, so day rollover is handled correctly whenever BoM refreshes.

#### Display

Cell layout (rain values in the default text colour, `--primary-text-color`):

```
┌──────────────┐
│ 💧       15+ │  ← watering indicator: top-left │ forecast: top-right, small, bold
│     (6)      │  ← date, fixed at centre (today: filled circle)
│          3.2 │  ← observed: bottom-right, small, bold
└──────────────┘
```

- All rain data lives in the right-hand column, and the date stays fixed at the centre.
- Each value has a fixed position (top = forecast, bottom = actual), so they're distinguishable by position as well as by style. Today shows both stacked.
- Zero / no data → blank.
- Observed: round to 1 decimal place if < 10, whole number otherwise (e.g. `0.4`, `3.2`, `12`).

**Forecast label from a BoM range.** BoM's lower figure has a 50% chance of being exceeded, and the upper figure 25%. For a "should I water?" decision the lower bound is the meaningful number:

| BoM min–max | Cell shows |
|-------------|-----------|
| 0 / none | blank |
| 0–N (e.g. 0–1, 0–5) | `<N` |
| M–N, M > 0 (e.g. 15–30) | `M+` |

That's at most 3 characters, which fits a phone-width cell. Optionally, the full ranges (e.g. `15–30 mm`) appear in a 7-day forecast row in the summary bar, because tap is already used for toggling and tooltips don't work on touch.

**Cell size:** with rain values in the corners, the centre only holds the date, so square cells should still work. Check on a phone-width viewport; fall back to `aspect-ratio: 1 / 1.15` if the corners crowd the number.

#### New config options (proposed)

| Option | Example | Notes |
|--------|---------|-------|
| `rain_entity` | `sensor.icanbe339_rainfall_today` | Daily-total rain sensor (`total_increasing`). Omit to disable observed rain. |
| `rain_forecast_prefix` | `sensor.phillip` | Card reads `<prefix>_rain_amount_min_N` / `_max_N` for N = 0–6. Omit to disable forecast. |
| `show_forecast_row` | `true` | Full forecast ranges in the summary bar |

Rain features are entirely optional, so the card stays general-purpose.

#### Findings from the mock-up (`dev/mockup.html`)

- ~~Past-day dimming also dims rain values~~ — **Fixed in Change 1:** dimming now targets the date and indicator only.
- ~~Forecast on a watering day has weak contrast~~ — **Decided:** rain values use the default text colour (white in dark mode), not blue, at full opacity. Forecast vs. actual is distinguished by position (top vs. bottom) alone; both values are bold, same size and colour. Italic, then regular weight, were tried for the forecast and dropped in favour of a uniform style. Verified readable on green watering cells in both dark and light mode.

#### Open questions / risks

- ~~Does the WU daily total reset at midnight?~~ — **Confirmed** by observation (3 Oct 2026).

- ~~What BoM reports for "no rain"~~ — **Resolved:** `max` is `0`. Still treat non-numeric values (`unknown`/`unavailable`) as no data.
- ~~BoM day rollover~~ — **Resolved:** sensors carry a `date` attribute, and the card keys forecasts by it. Between midnight and the next BoM issue (`next_issue_time` attribute, e.g. 04:15), `_0` still holds yesterday's date, so today simply shows no forecast until the refresh.
- **WU glitches.** If the scrape briefly returns 0 or a low value mid-day, `total_increasing` sees a false reset and that day's `change` is inflated. If this shows up in practice, an `availability` template on the REST sensor, or rejecting implausible daily values, would mitigate it.
- **Midnight boundary.** With a 5-minute scrape, rain in the last few minutes before midnight may be counted on the following day. This is acceptable.
- **Statistics period alignment.** Verify that `period: "day"` buckets align to local midnight (expected) and not UTC.

---

## Configuration options summary

| Option | Default | Notes |
|--------|---------|-------|
| `entity` | required | Calendar entity ID |
| `title` | `"Schedule"` | Card header |
| `icon` | `"📅"` | Watering indicator — emoji on selected days |
| `event_summary` | `"<icon> <title>"` | Stored as the HA event summary |
| `accent_color` | `"#4dc98a"` | Hex; drives all derived CSS colours |
| `show_summary_bar` | `true` | Upcoming-dates strip at the bottom |
| `summary_title` | `"Upcoming <title>"` | Strip label |
| `allow_past` | `false` | Whether past days are clickable |
