# HA Calendar Picker

A custom Home Assistant Lovelace card that turns any Local Calendar entity into an interactive date picker. Click a day to schedule it; click again to remove it. The calendar entity is `on` on selected days, so automations can act only on those days.

Originally built for watering schedules, but works for any recurring "is today a selected day?" use case — bin collection, medication reminders, irrigation zones, and more.

![Watering schedule card in dark mode, with today circled, watering days highlighted, and rainfall in the corners of each day](https://raw.githubusercontent.com/suspectprism/ha-calendar-picker/main/images/desktop-dark.png)

Today is shown as a filled circle, and selected days are highlighted in the accent colour with the `icon` in the top-left corner. Past days are dimmed. The rainfall figures in the corners are an [optional feature](#rainfall-optional).

---

## Requirements

- **Home Assistant 2023.6 or later** (see [Compatibility](#compatibility))
- A calendar entity that supports creating and deleting events, e.g. one from the **Local Calendar** integration (`calendar.watering`)

No other integrations are needed.

> **Upgrading from v1.2.x or earlier?** Earlier versions needed the **Calendar Utils** integration to delete events. Since v1.3.0 the card uses Home Assistant's built-in calendar commands instead, so you can uninstall Calendar Utils unless something else uses it. (Calendar Utils fails to load on Home Assistant 2026.10, which broke deleting in earlier versions of this card.)

---

## Compatibility

The card only uses features built into Home Assistant core. The table shows what each one needs; the newest requirement sets the minimum version.

| Feature | Home Assistant feature used | Available since |
|---------|-----------------------------|-----------------|
| Show selected days | REST API `GET /api/calendars/<entity>` | Long before 2023 |
| Add a day | `calendar.create_event` action | Early 2023 |
| Remove a day | Websocket command `calendar/event/delete` (the same command HA's own Calendar panel uses) | Before 2023 |
| Observed rainfall on past days (optional) | Websocket `recorder/statistics_during_period` with the `change` statistic type | **2023.6** |
| Observed rainfall today, forecast rainfall (optional) | Entity states | Always |

Tested with Home Assistant 2026.10.

**Browsers:** the card's styling uses CSS `color-mix()` and container queries, which need Chrome/Edge 111+, Safari 16.2+ (iOS 16.2+) or Firefox 113+, all released in 2023. The Home Assistant Companion apps use the device's built-in web view, which meets this on any reasonably up-to-date phone.

**Calendar integrations:** creating and deleting events must be supported by the calendar integration itself. Local Calendar and Google Calendar both support it. If a calendar doesn't, removing a day shows "Calendar does not support event deletion".

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
| `rain_entity` | string | — | Daily rainfall sensor; shows observed rain on past days and today. See [Rainfall](#rainfall-optional) |
| `rain_forecast_prefix` | string | — | BoM forecast sensor prefix; shows forecast rain on today and the next 6 days. See [Rainfall](#rainfall-optional) |

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

## Rainfall (optional)

For a watering schedule, the deciding factor is usually rainfall: how many days since the garden last got good rain, and when more is forecast. Instead of comparing the calendar with a separate weather card, the card can show rainfall directly on each day:

- **Top-right:** forecast rain (today and the next 6 days)
- **Bottom-right:** observed rain (past days and today so far)

Hover over a day to see the full forecast range and observed amount in millimetres.

<p>
  <img src="https://raw.githubusercontent.com/suspectprism/ha-calendar-picker/main/images/phone-dark.png" width="320" alt="Card at phone width in dark mode, showing forecast rain top-right and observed rain bottom-right">
  <img src="https://raw.githubusercontent.com/suspectprism/ha-calendar-picker/main/images/phone-light.png" width="320" alt="The same card at phone width in light mode">
</p>

*Phone width, dark and light themes. On 3 October, 15+ mm was forecast and 31 mm had fallen so far.*

> **This feature is niche.** It's only useful if you have a suitable rainfall sensor and/or forecast sensors, described below. Without these options the card works exactly as before.

### Observed rainfall — `rain_entity`

A sensor holding **today's rainfall total in mm, resetting to 0 at midnight**, with `state_class: total_increasing`. For example, a Weather Underground personal weather station via a REST sensor:

```yaml
- name: "My Station Rainfall Today"
  unique_id: my_station_precip_today
  value_template: "{{ value_json.observations[0].metric.precipTotal }}"
  unit_of_measurement: "mm"
  device_class: precipitation
  state_class: total_increasing
```

Today's value is read live. Past days come from Home Assistant's long-term statistics, which are generated automatically for sensors with a `state_class` and kept indefinitely, so no helpers or extra entities are needed. History is only available from when `state_class` was first set on the sensor. To check that statistics are being recorded, search for the sensor in **Developer Tools → Statistics**.

### Forecast rainfall — `rain_forecast_prefix`

Designed for the [Bureau of Meteorology integration](https://github.com/bremor/bureau_of_meteorology) (Australia), which creates per-day sensors such as `sensor.<place>_rain_amount_min_0` / `_max_0` through `_6`. Set the prefix to the part before `_rain_amount`:

```yaml
rain_forecast_prefix: sensor.tuggeranong
```

BoM gives a range (e.g. 15–30 mm). To fit a phone-sized cell, the card shows a short label:

| BoM range | Cell shows | Meaning |
|-----------|-----------|---------|
| 0 | *(blank)* | No rain forecast |
| 0–5 | `<5` | Up to 5 mm possible |
| 15–30 | `15+` | 50% chance of at least 15 mm |

### Example — Watering schedule with rainfall

```yaml
type: custom:ha-calendar-picker
entity: calendar.watering
title: Watering Schedule
icon: "💧"
summary_title: Upcoming watering days
rain_entity: sensor.my_station_rainfall_today
rain_forecast_prefix: sensor.tuggeranong
```

---

## Using with automations

The calendar entity's state is `on` whenever an event is currently active. Since this card creates all-day events (midnight to midnight), the entity is `on` for the entire selected day.

Check that state in an automation's conditions:

```yaml
triggers:
  - trigger: time
    at: "07:00:00"

conditions:
  - condition: state
    entity_id: calendar.watering
    state: "on"

actions:
  - action: switch.turn_on
    target:
      entity_id: switch.garden_tap
```

The time trigger fires daily at 07:00; the condition passes only on days selected in the card, so watering runs only on those days. This works on every Home Assistant version. Recent versions also offer a calendar **"Is event active"** condition in the automation editor, which does the same job.

---

## How it works

**Adding a day:** Calls `calendar.create_event` with a summary of `event_summary` and a duration spanning 00:00 to 00:00 the following day, so the calendar is `on` for the whole day.

**Removing a day:** Home Assistant has no `calendar.delete_event` action, so the card sends the `calendar/event/delete` websocket command with the event's UID. It's the same command Home Assistant's own Calendar panel uses to delete events.

**UI updates:** Day toggles apply optimistically so the calendar responds immediately, then re-syncs with Home Assistant in the background.

---

## Troubleshooting

**Card shows "Custom element doesn't exist"**
- Confirm the resource URL is `/local/ha-calendar-picker.js` with type **JavaScript Module**
- Hard-refresh your browser: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)

**Delete fails with "install the 'Calendar Utils' integration"**
- You're running v1.2.x or earlier. Update the card to v1.3.0 or later, which doesn't need Calendar Utils

**Delete fails with "Calendar does not support event deletion"**
- The calendar's integration doesn't allow events to be deleted. Use a Local Calendar entity instead

**Delete fails with "No event UID found"**
- Try navigating away and back to the card to force a refresh, then try again

**Changes not reflected after updating the card file**
- Bump the resource URL to bust the cache: change it to `/local/ha-calendar-picker.js?v=2` (increment on each update), then hard-refresh

**Selected days disappear after a HA restart**
- The card reads from the Local Calendar integration. Events are stored in your HA config and persist across restarts. If events vanish, check the Local Calendar integration is healthy.
