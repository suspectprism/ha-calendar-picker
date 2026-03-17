// ha-calendar-picker — HACS custom Lovelace card
// A general-purpose calendar date-picker card for Home Assistant.
//
// Installation:
//   HACS: search "HA Calendar Picker" and install
//   Manual: copy this file to /config/www/ha-calendar-picker.js
//           add resource: /local/ha-calendar-picker.js (JavaScript Module)
//
// Card config:
//   type: custom:ha-calendar-picker
//   entity: calendar.my_calendar     # required
//   title: My Schedule               # optional
//   icon: "📅"                       # optional
//   event_summary: "📅 My Event"     # optional
//   accent_color: "#4dc98a"          # optional
//   show_summary_bar: true           # optional
//   summary_title: Upcoming dates    # optional
//   allow_past: false                # optional

const VERSION = "1.0.0";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const DEFAULT_ACCENT = "#4dc98a";
const DEFAULT_ICON   = "📅";

// ---------------------------------------------------------------------------

class HaCalendarPicker extends HTMLElement {

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass         = null;
    this._cfg          = {};
    this._today        = new Date();
    this._viewYear     = this._today.getFullYear();
    this._viewMonth    = this._today.getMonth();
    this._selectedDays = new Set();   // Set<"YYYY-MM-DD">
    this._eventMap     = {};          // "YYYY-MM-DD" -> uid string | null
    this._loading      = new Set();   // days currently being toggled
    this._eventsLoaded = false;
    this._lastError    = null;        // string | null
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("ha-calendar-picker: 'entity' is required (e.g. calendar.my_calendar)");
    }
    const icon  = config.icon  ?? DEFAULT_ICON;
    const title = config.title ?? "Schedule";
    this._cfg = {
      entity:         config.entity,
      title,
      icon,
      eventSummary:   config.event_summary   ?? `${icon} ${title}`,
      accentColor:    config.accent_color    ?? DEFAULT_ACCENT,
      showSummaryBar: config.show_summary_bar !== false,   // default true
      summaryTitle:   config.summary_title   ?? `Upcoming ${title}`,
      allowPast:      config.allow_past      === true,     // default false
    };
    this._render();
  }

  set hass(hass) {
    const initial = !this._hass;
    this._hass = hass;
    if (initial || !this._eventsLoaded) {
      this._fetchEvents();
    }
  }

  getCardSize() { return 6; }

  // ── API: fetch events ─────────────────────────────────────────────────────

  async _fetchEvents() {
    if (!this._hass || !this._cfg.entity) return;

    // 3-month window: previous, current, next
    const start = new Date(this._viewYear, this._viewMonth - 1, 1);
    const end   = new Date(this._viewYear, this._viewMonth + 2, 0);

    try {
      const url  = `calendars/${this._cfg.entity}?start=${this._fmtDate(start)}T00:00:00&end=${this._fmtDate(end)}T00:00:00`;
      const resp = await this._hass.callApi("GET", url);

      // Atomic state update — only swap in new data once fully loaded
      const newSelected = new Set();
      const newMap      = {};
      (resp || []).forEach(ev => {
        const dateStr = (ev.start?.date || ev.start?.dateTime || "").slice(0, 10);
        if (dateStr) {
          newSelected.add(dateStr);
          newMap[dateStr] = ev.uid || ev.id || null;
        }
      });
      this._selectedDays = newSelected;
      this._eventMap     = newMap;
      this._eventsLoaded = true;
      this._lastError    = null;
    } catch (e) {
      this._eventsLoaded = true;
      this._lastError = `Failed to load calendar: ${e.message || e}`;
    }

    this._render();
  }

  // ── API: toggle a day ─────────────────────────────────────────────────────

  async _toggleDay(dateStr) {
    if (this._loading.has(dateStr)) return;
    if (!this._cfg.allowPast && dateStr < this._fmtDate(this._today)) return;

    const wasSelected = this._selectedDays.has(dateStr);

    // Optimistic update so the UI responds immediately
    this._loading.add(dateStr);
    this._lastError = null;
    wasSelected
      ? this._selectedDays.delete(dateStr)
      : this._selectedDays.add(dateStr);
    this._render();

    try {
      if (wasSelected) {
        await this._deleteEvent(dateStr);
      } else {
        await this._createEvent(dateStr);
      }
    } catch (e) {
      // Revert optimistic change and surface the error
      wasSelected
        ? this._selectedDays.add(dateStr)
        : this._selectedDays.delete(dateStr);
      this._lastError = e.message || String(e);
    }

    this._loading.delete(dateStr);
    this._render();

    // Background resync to keep UIDs accurate (fire and forget)
    this._fetchEvents();
  }

  async _createEvent(dateStr) {
    const nextDay = new Date(`${dateStr}T00:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    await this._hass.callService("calendar", "create_event", {
      entity_id:       this._cfg.entity,
      summary:         this._cfg.eventSummary,
      start_date_time: `${dateStr} 00:00:00`,
      end_date_time:   `${this._fmtDate(nextDay)} 00:00:00`,
    });
  }

  async _deleteEvent(dateStr) {
    const uid = this._eventMap[dateStr] ?? await this._queryUid(dateStr);
    if (!uid) {
      throw new Error(`No event UID found for ${dateStr} — try refreshing`);
    }
    await this._hass.callService("calendar", "delete_event", {
      entity_id: this._cfg.entity,
      uid,
    });
  }

  async _queryUid(dateStr) {
    try {
      const nextDay = new Date(`${dateStr}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      const url  = `calendars/${this._cfg.entity}?start=${dateStr}T00:00:00&end=${this._fmtDate(nextDay)}T00:00:00`;
      const resp = await this._hass.callApi("GET", url);
      const ev   = (resp || []).find(e =>
        (e.start?.date || e.start?.dateTime || "").slice(0, 10) === dateStr
      );
      return ev?.uid || ev?.id || null;
    } catch {
      return null;
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  _prevMonth() {
    if (this._viewMonth === 0) { this._viewMonth = 11; this._viewYear--; }
    else this._viewMonth--;
    this._eventsLoaded = false;
    this._fetchEvents();
  }

  _nextMonth() {
    if (this._viewMonth === 11) { this._viewMonth = 0; this._viewYear++; }
    else this._viewMonth++;
    this._eventsLoaded = false;
    this._fetchEvents();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _render() {
    if (!this._cfg.entity) return;

    this.shadowRoot.innerHTML = `
      ${this._styles()}
      <ha-card style="--hcp-accent:${this._cfg.accentColor}">
        ${this._renderHeader()}
        ${this._lastError ? this._renderError(this._lastError) : ""}
        ${!this._eventsLoaded
          ? `<div class="loading-overlay">Loading calendar…</div>`
          : this._renderGrid()}
        ${this._eventsLoaded && this._cfg.showSummaryBar
          ? this._renderSummary()
          : ""}
      </ha-card>`;

    this._attachListeners();
  }

  _renderHeader() {
    return `
      <div class="header">
        <span class="title">${this._cfg.title}</span>
        <div class="month-nav">
          <button class="nav-btn" id="prev">&#8249;</button>
          <span class="month-label">${MONTHS[this._viewMonth]} ${this._viewYear}</span>
          <button class="nav-btn" id="next">&#8250;</button>
        </div>
      </div>`;
  }

  _renderGrid() {
    const { _viewYear: year, _viewMonth: month } = this;
    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr    = this._fmtDate(this._today);

    let cells = "";
    for (let i = 0; i < firstDay; i++) {
      cells += `<div class="day empty"></div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr    = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isToday    = dateStr === todayStr;
      const isSelected = this._selectedDays.has(dateStr);
      const isLoading  = this._loading.has(dateStr);
      const isPast     = dateStr < todayStr;
      const isBlocked  = isPast && !this._cfg.allowPast;

      const classes = [
        "day",
        isToday    && "today",
        isSelected && "selected",
        isLoading  && "loading",
        isPast     && "past",
        isBlocked  && "blocked",
      ].filter(Boolean).join(" ");

      cells += `
        <div class="${classes}" data-date="${dateStr}" title="${dateStr}">
          <span class="day-num">${d}</span>
          ${isSelected && !isLoading ? `<span class="icon">${this._cfg.icon}</span>` : ""}
          ${isLoading               ? `<span class="spinner"></span>`               : ""}
        </div>`;
    }

    return `
      <div class="day-headers">
        ${DAYS.map(d => `<div class="day-header">${d}</div>`).join("")}
      </div>
      <div class="grid" id="grid">${cells}</div>`;
  }

  _renderSummary() {
    const todayStr = this._fmtDate(this._today);
    const upcoming = [...this._selectedDays].filter(d => d >= todayStr).sort();

    if (!upcoming.length) {
      return `<div class="summary empty-sum">No dates scheduled yet — tap a day to add one.</div>`;
    }

    const tags = upcoming.map(d => {
      const [, m, day] = d.split("-");
      return `<span class="tag">${MONTHS[+m - 1].slice(0, 3)} ${+day}</span>`;
    }).join("");

    return `
      <div class="summary">
        <span class="sum-label">${this._cfg.icon} ${this._cfg.summaryTitle} (${upcoming.length})</span>
        <div class="sum-dates">${tags}</div>
      </div>`;
  }

  _renderError(msg) {
    return `<div class="error-bar">⚠️ ${msg}</div>`;
  }

  // ── Event listeners ───────────────────────────────────────────────────────

  _attachListeners() {
    const root = this.shadowRoot;
    root.getElementById("prev")?.addEventListener("click", () => this._prevMonth());
    root.getElementById("next")?.addEventListener("click", () => this._nextMonth());

    // Single delegated listener for all day cells
    root.getElementById("grid")?.addEventListener("click", e => {
      const cell = e.target.closest(".day[data-date]");
      if (cell) this._toggleDay(cell.dataset.date);
    });
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  _styles() {
    return `<style>
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');

      :host { display: block; font-family: 'DM Sans', sans-serif; }

      ha-card {
        /* --hcp-accent is set inline from config; derived variants use color-mix */
        --hcp-accent: ${DEFAULT_ACCENT};
        --hcp-accent-25: color-mix(in srgb, var(--hcp-accent) 25%, transparent);
        --hcp-accent-15: color-mix(in srgb, var(--hcp-accent) 15%, transparent);
        --hcp-accent-12: color-mix(in srgb, var(--hcp-accent) 12%, transparent);

        background: linear-gradient(145deg, #0d1f2d 0%, #122333 60%, #0a2a1e 100%);
        color: #e8f4f0;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      }

      /* ── Header ── */
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 20px 10px;
        border-bottom: 1px solid var(--hcp-accent-15);
      }
      .title {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--hcp-accent);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .month-nav { display: flex; align-items: center; gap: 12px; }
      .month-label {
        font-size: 1rem;
        font-weight: 500;
        min-width: 140px;
        text-align: center;
        color: #c8ede0;
      }
      .nav-btn {
        background: var(--hcp-accent-12);
        border: 1px solid var(--hcp-accent-25);
        color: var(--hcp-accent);
        border-radius: 8px;
        width: 30px; height: 30px;
        cursor: pointer;
        font-size: 1rem;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.2s;
        user-select: none;
      }
      .nav-btn:hover { background: var(--hcp-accent-25); }

      /* ── Grid ── */
      .day-headers, .grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 4px;
      }
      .day-headers { padding: 10px 12px 4px; }
      .grid        { padding: 4px 12px 12px; }

      .day-header {
        text-align: center;
        font-size: 0.7rem;
        font-weight: 500;
        color: rgba(200,237,224,0.45);
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .day {
        position: relative;
        aspect-ratio: 1;
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.18s, transform 0.12s;
        background: rgba(255,255,255,0.04);
        border: 1px solid transparent;
        user-select: none;
      }
      .day:hover:not(.empty):not(.blocked) {
        background: var(--hcp-accent-12);
        border-color: var(--hcp-accent-25);
        transform: scale(1.05);
      }
      .day.empty   { cursor: default; background: transparent; border: none; }
      .day.past    { opacity: 0.45; }
      .day.blocked { cursor: default; pointer-events: none; }
      .day.today {
        border-color: color-mix(in srgb, var(--hcp-accent) 60%, transparent);
        background: var(--hcp-accent-12);
      }
      .day.selected {
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--hcp-accent) 40%, #000),
          color-mix(in srgb, var(--hcp-accent) 22%, #000)
        );
        border-color: var(--hcp-accent);
        box-shadow: 0 0 12px color-mix(in srgb, var(--hcp-accent) 35%, transparent);
      }
      .day.loading { opacity: 0.6; pointer-events: none; }

      .day-num {
        font-size: 0.85rem;
        font-weight: 500;
        line-height: 1;
        color: #c8ede0;
      }
      .day.selected .day-num {
        color: color-mix(in srgb, var(--hcp-accent) 85%, #fff);
        font-weight: 600;
      }
      .day.today .day-num { color: var(--hcp-accent); }

      .icon { font-size: 0.65rem; line-height: 1; margin-top: 1px; }

      .spinner {
        position: absolute;
        width: 18px; height: 18px;
        border: 2px solid var(--hcp-accent-25);
        border-top-color: var(--hcp-accent);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* ── Summary bar ── */
      .summary {
        margin: 0 12px 14px;
        background: var(--hcp-accent-12);
        border: 1px solid var(--hcp-accent-15);
        border-radius: 10px;
        padding: 10px 14px;
      }
      .summary.empty-sum {
        color: rgba(200,237,224,0.4);
        font-size: 0.8rem;
        font-style: italic;
      }
      .sum-label {
        display: block;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--hcp-accent);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 8px;
      }
      .sum-dates { display: flex; flex-wrap: wrap; gap: 5px; }
      .tag {
        background: color-mix(in srgb, var(--hcp-accent) 20%, transparent);
        border: 1px solid color-mix(in srgb, var(--hcp-accent) 35%, transparent);
        color: color-mix(in srgb, var(--hcp-accent) 85%, #fff);
        border-radius: 5px;
        padding: 2px 8px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      /* ── Misc ── */
      .loading-overlay {
        text-align: center;
        padding: 20px;
        color: rgba(200,237,224,0.4);
        font-size: 0.85rem;
      }
      .error-bar {
        margin: 8px 12px 0;
        background: rgba(220,80,80,0.12);
        border: 1px solid rgba(220,80,80,0.35);
        border-radius: 8px;
        padding: 8px 12px;
        color: #ff9090;
        font-size: 0.8rem;
      }
    </style>`;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  _fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}

customElements.define("ha-calendar-picker", HaCalendarPicker);
