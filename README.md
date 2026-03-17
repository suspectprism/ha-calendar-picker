# HA Calendar Picker

A custom Home Assistant Lovelace card that turns any Local Calendar entity into an interactive date picker. Click a day to schedule it; click again to remove it. Use the built-in calendar condition in automations to act only on selected days.

Originally built for watering schedules, but works for any recurring "is today a selected day?" use case — bin collection, medication reminders, irrigation zones, and more.

---

## Requirements

- Home Assistant with the **Local Calendar** integration enabled
- A calendar entity (e.g. `calendar.watering`)
- The **Calendar Utils** integration (required for deleting events — see [Dependencies](#dependencies) below)

---

## Dependencies

### Calendar Utils

The Local Calendar integration does not expose a native delete-event action. This card uses the community [**Calendar Utils**](https://github.com/swehog/hacs_calendar_utils) integration as a fallback to handle event deletion.

> **Note:** Calendar Utils is not in the main HACS catalogue. You must add it as a custom repository.

**Installation:**

1. In HACS, click the **⋮** menu (top-right) and choose **Custom repositories**
2. Enter `https://github.com/swehog/hacs_calendar_utils` and set the category to **Integration**, then click **Add**
3. Search for **Calendar Utils** in HACS → Integrations and install it
4. Restart Home Assistant
5. Go to **Settings → Devices & Services → + Add Integration**, search for **Calendar Utils** and add it

After setup, `calendar_utils.delete_event_by_uid` should appear in **Developer Tools → Actions**.

> If you use a calendar integration that natively supports event deletion (e.g. Google Calendar), Calendar Utils is not required — the card will automatically use the native action where available.

---

## Installation

### HACS (recommended)

1. Ensure [Calendar Utils](#dependencies) is installed first (see above)
2. Open HACS in your Home Assistant sidebar
3. Go to **Frontend**
4. Click **+ Explore & Download Repositories**
5. Search for **HA Calendar Picker** and install it
6. Reload your browser

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

**Removing a day:** The card checks at runtime which delete action is available:
1. `calendar.delete_event` — used if the calendar integration supports it natively (e.g. Google Calendar)
2. `calendar_utils.delete_event_by_uid` — used as a fallback for Local Calendar, which does not expose a native delete action

**UI updates:** Day toggles apply optimistically so the calendar responds immediately, then re-syncs with Home Assistant in the background.

---

## Troubleshooting

**Card shows "Custom element doesn't exist"**
- Confirm the resource URL is `/local/ha-calendar-picker.js` with type **JavaScript Module**
- Hard-refresh your browser: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)

**Delete fails with "install the 'Calendar Utils' integration"**
- The Local Calendar integration does not support native event deletion
- Follow the [Calendar Utils installation steps](#dependencies) above
- After installing, verify `calendar_utils.delete_event_by_uid` appears in **Developer Tools → Actions**

**Delete fails with "No event UID found"**
- Try navigating away and back to the card to force a refresh, then try again

**Changes not reflected after updating the card file**
- Bump the resource URL to bust the cache: change it to `/local/ha-calendar-picker.js?v=2` (increment on each update), then hard-refresh

**Selected days disappear after a HA restart**
- The card reads from the Local Calendar integration. Events are stored in your HA config and persist across restarts. If events vanish, check the Local Calendar integration is healthy.
