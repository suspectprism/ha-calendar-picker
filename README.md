# HA Calendar Picker

A custom Home Assistant Lovelace card that turns any Local Calendar entity into an interactive date picker. Click a day to schedule it; click again to remove it. Use the built-in calendar condition in automations to act only on selected days.

Originally built for watering schedules, but works for any recurring "is today a selected day?" use case — bin collection, medication reminders, irrigation zones, and more.

---

## Requirements

- Home Assistant with the **Local Calendar** integration enabled
- A calendar entity (e.g. `calendar.watering`)
- Home Assistant version **2023.11 or later** (required for `calendar.delete_event`)

---

## Installation

### HACS (recommended)

1. Open HACS in your Home Assistant sidebar
2. Go to **Frontend**
3. Click **+ Explore & Download Repositories**
4. Search for **HA Calendar Picker** and install it
5. Reload your browser

### Manual

1. Download `dist/ha-calendar-picker.js` from this repository
2. Copy it to `/config/www/ha-calendar-picker.js` on your Home Assistant instance
3. Go to **Settings → Dashboards → ⋮ → Resources**
4. Click **+ Add Resource**
   - URL: `/local/ha-calendar-picker.js`
   - Type: **JavaScript Module**
5. Reload your browser

---

## Usage

Add the card to any Lovelace dashboard via **Edit Dashboard → Add Card → Manual**:

```yaml
type: custom:ha-calendar-picker
entity: calendar.watering
```

| Action | Result |
|--------|--------|
| Click an unscheduled day | Creates an event for that day |
| Click a scheduled (highlighted) day | Removes the event |
| Click **‹** / **›** | Navigate to previous / next month |

---

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entity` | string | **required** | Calendar entity ID (e.g. `calendar.watering`) |
| `title` | string | `"Schedule"` | Card header title |
| `icon` | string | `"📅"` | Emoji displayed on selected days |
| `event_summary` | string | `"<icon> <title>"` | Text stored as the HA calendar event summary |
| `accent_color` | string | `"#4dc98a"` | Accent / highlight colour (hex) |
| `show_summary_bar` | boolean | `true` | Show the upcoming-dates strip at the bottom |
| `summary_title` | string | `"Upcoming <title>"` | Label shown in the summary bar |
| `allow_past` | boolean | `false` | Allow toggling past dates |

### Example — Watering schedule

```yaml
type: custom:ha-calendar-picker
entity: calendar.watering
title: Watering Schedule
icon: "💧"
event_summary: "💧 Watering"
accent_color: "#4dc98a"
summary_title: Upcoming watering days
```

### Example — Bin collection

```yaml
type: custom:ha-calendar-picker
entity: calendar.bin_collection
title: Bin Collection
icon: "🗑️"
accent_color: "#a0c4ff"
summary_title: Collection days
```

### Example — Minimal (all defaults)

```yaml
type: custom:ha-calendar-picker
entity: calendar.my_calendar
```

---

## Using with automations

The calendar entity's state is `on` whenever an event is currently active. Since this card creates all-day events (midnight to midnight), the entity is `on` for the entire selected day.

Use a **Calendar trigger** or a **Calendar condition** to drive automations:

```yaml
triggers:
  - trigger: time
    at: "07:00:00"

conditions:
  - condition: calendar
    entity_id: calendar.watering

actions:
  - action: switch.turn_on
    target:
      entity_id: switch.garden_tap
```

The time trigger fires daily at 07:00; the calendar condition passes only on days selected in the card, so watering runs only on those days.

---

## How it works

**Adding a day:** Calls `calendar.create_event` with a summary of `event_summary` and a duration spanning 00:00 to 00:00 the following day (full-day coverage required for the calendar condition to pass).

**Removing a day:** Calls `calendar.delete_event` with the event's UID — no shell commands, no Python scripts, no manual configuration required.

**UI updates:** Day toggles apply optimistically so the calendar responds immediately, then re-syncs with Home Assistant in the background.

---

## Troubleshooting

**Card shows "Custom element doesn't exist"**
- Confirm the resource URL is `/local/ha-calendar-picker.js` with type **JavaScript Module**
- Hard-refresh your browser: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)

**Delete fails with an error**
- Ensure your HA version is 2023.11 or later (`calendar.delete_event` was added then)
- Check **Developer Tools → Actions**, search for `calendar.delete_event` — it must exist

**Changes not reflected after updating the card file**
- Bump the resource URL to bust the cache: change it to `/local/ha-calendar-picker.js?v=2` (increment on each update), then hard-refresh

**Selected days disappear after a HA restart**
- The card reads from the Local Calendar integration. Events are stored in your HA config and persist across restarts. If events vanish, check the Local Calendar integration is healthy.
