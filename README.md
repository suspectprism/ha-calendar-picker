# HA Calendar Picker

A custom Home Assistant Lovelace card that turns any Local Calendar entity into an interactive date picker. Click a day to schedule it; click again to remove it. Use the built-in calendar condition in automations to act only on selected days.

Originally built for watering schedules, but works for any recurring "is today a selected day?" use case — bin collection, medication reminders, irrigation zones, and more.

![Watering schedule card in dark mode, with today circled, watering days highlighted, and rainfall in the corners of each day](https://raw.githubusercontent.com/suspectprism/ha-calendar-picker/main/images/desktop-dark.png)

Today is shown as a filled circle, and selected days are highlighted in the accent colour with the `icon` in the top-left corner. Past days are dimmed. The rainfall figures in the corners are an [optional feature](#rainfall-optional).

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
