const VERSION = "0.0.1";

class SmappeeEvCard extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._entities = {};
  }

  static getConfigElement() {
    return document.createElement("smappee-ev-card-editor");
  }

  static getStubConfig() {
    return { device_id: "", show_session: true, show_power: true, show_controls: true };
  }

  setConfig(config) {
    if (!config.device_id) throw new Error("device_id is required");
    this._config = {
      show_session: true,
      show_power: true,
      show_controls: true,
      ...config,
    };
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._entities = this._entitiesForDevice(this._config.device_id);
    this._render();
  }

  _entitiesForDevice(deviceId) {
    if (!deviceId || !this._hass) return {};
    const all = Object.values(this._hass.entities || {});
    const forDevice = all.filter(e => e.device_id === deviceId);
    const find = key => (forDevice.find(e => e.entity_id.includes(key)) || {}).entity_id;
    return {
      evse_status:      find("status_current"),
      evcc_state:       find("evcc_state"),
      charging_state:   find("charging_state"),
      power:            find("power_total"),
      current:          find("current_total"),
      session_energy:   find("session_energy"),
      energy_import:    find("energy_import_kwh"),
      charging_mode:    find("charging_mode"),
      charging_switch:  find("switch:charging") || find("evcc_charging"),
      current_slider:   find("number:current") || find("max_charging_speed"),
      grid_power:       find("grid_power"),
      pv_power:         find("pv_power"),
      house_power:      find("house_consumption_power"),
      mqtt_connected:   find("mqtt_connected"),
    };
  }

  _state(entityId) {
    if (!entityId || !this._hass) return null;
    return this._hass.states[entityId] || null;
  }

  _val(entityId) {
    const s = this._state(entityId);
    return s ? s.state : null;
  }

  _attr(entityId, attr) {
    const s = this._state(entityId);
    return s ? s.attributes[attr] : null;
  }

  _t(key) {
    const lang = (this._hass?.locale?.language || "en").toLowerCase().slice(0, 2);
    const nl = {
      standard: "Standaard", smart: "Slim", solar: "Zonne-energie",
      session: "Sessie", power: "Vermogen", grid: "Net", pv: "PV", house: "Huis",
      current: "Stroom", energy: "Energie", duration: "Duur",
      no_device: "Kies een device in de editor.",
      charging: "Laden", available: "Beschikbaar", cable_connected: "Kabel verbonden",
      charging_finished: "Laden voltooid", error: "Fout", suspended_evse: "Onderbroken",
      initialize: "Initialiseren",
    };
    const en = {
      standard: "Standard", smart: "Smart", solar: "Solar",
      session: "Session", power: "Power", grid: "Grid", pv: "PV", house: "House",
      current: "Current", energy: "Energy", duration: "Duration",
      no_device: "Pick a device in the editor.",
      charging: "Charging", available: "Available", cable_connected: "Cable connected",
      charging_finished: "Charging finished", error: "Error", suspended_evse: "Suspended",
      initialize: "Initializing",
    };
    return (lang === "nl" ? nl : en)[key] || key;
  }

  _evseColor(status) {
    switch (status) {
      case "charging":          return "var(--success-color, #4caf50)";
      case "cable_connected":   return "var(--warning-color, #e0956a)";
      case "error":             return "var(--error-color, #e05c6a)";
      case "suspended_evse":    return "var(--warning-color, #e0956a)";
      case "charging_finished": return "var(--info-color, #2196f3)";
      default:                  return "var(--secondary-text-color)";
    }
  }

  _evseBackground(status) {
    switch (status) {
      case "charging":          return "var(--success-color-background, rgba(76,175,80,0.15))";
      case "cable_connected":   return "rgba(224,149,106,0.15)";
      case "error":             return "rgba(224,92,106,0.15)";
      case "suspended_evse":    return "rgba(224,149,106,0.15)";
      case "charging_finished": return "rgba(33,150,243,0.15)";
      default:                  return "var(--secondary-background-color)";
    }
  }

  _fmt(value, unit, precision = 1) {
    if (value === null || value === undefined || value === "unavailable" || value === "unknown") return "—";
    const n = parseFloat(value);
    if (isNaN(n)) return value;
    return `${n.toFixed(precision)} ${unit}`;
  }

  _fmtPower(value) {
    const n = parseFloat(value);
    if (isNaN(n)) return "—";
    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)} kW`;
    return `${Math.round(n)} W`;
  }

  async _setMode(mode) {
    const entityId = this._entities.charging_mode;
    if (!entityId) return;
    await this._hass.callService("select", "select_option", { entity_id: entityId, option: mode });
  }

  async _toggleCharging(on) {
    const entityId = this._entities.charging_switch;
    if (!entityId) return;
    await this._hass.callService("switch", on ? "turn_on" : "turn_off", { entity_id: entityId });
  }

  async _setCurrentSlider(value) {
    const entityId = this._entities.current_slider;
    if (!entityId) return;
    await this._hass.callService("number", "set_value", { entity_id: entityId, value });
  }

  _render() {
    if (!this._hass || !this._config.device_id) {
      this.innerHTML = `<ha-card><div style="padding:16px;color:var(--secondary-text-color);">${this._t("no_device")}</div></ha-card>`;
      return;
    }

    const e = this._entities;
    const show = {
      session:  this._config.show_session !== false,
      power:    this._config.show_power !== false,
      controls: this._config.show_controls !== false,
    };

    const evseStatus   = this._val(e.evse_status) || "initialize";
    const currentMode  = this._val(e.charging_mode);
    const chargingOn   = this._val(e.charging_switch) === "on";
    const mqttOn       = this._val(e.mqtt_connected) === "on";
    const isCharging   = evseStatus === "charging";
    const hasCable     = ["charging", "cable_connected", "charging_finished", "suspended_evse"].includes(evseStatus);

    // Device name from any entity
    const anyEntity = Object.values(e).find(id => id && this._hass.states[id]);
    const deviceName = anyEntity ? (this._hass.states[anyEntity].attributes.friendly_name || "").replace(/\s+(Vermogen|Power|Stroom|Current|Sessie|Session|Laadmodus|Charging mode|EVSE status|EVCC status|Laadstatus|Charging state).*$/i, "").trim() : "Smappee EV";

    // Session data
    const sessionEnergy   = this._val(e.session_energy);
    const sessionDuration = this._attr(e.session_energy, "duration_formatted");
    const sessionFrom     = this._attr(e.session_energy, "from");
    const powerVal        = this._val(e.power);
    const currentVal      = this._val(e.current);

    // Power data
    const gridPower  = this._val(e.grid_power);
    const pvPower    = this._val(e.pv_power);
    const housePower = this._val(e.house_power);

    // Slider
    const sliderState = this._state(e.current_slider);
    const sliderMin   = sliderState?.attributes?.min ?? 6;
    const sliderMax   = sliderState?.attributes?.max ?? 32;
    const sliderVal   = this._val(e.current_slider) ?? sliderMin;

    const modes = ["standard", "smart", "solar"];
    const modeIcons = { standard: "mdi:lightning-bolt", smart: "mdi:brain", solar: "mdi:solar-power" };

    this.innerHTML = `
      <ha-card>
        <style>
          .card { background: var(--card-background-color); color: var(--primary-text-color); font-family: var(--paper-font-body1_-_font-family); border-radius: var(--ha-card-border-radius, 12px); overflow: hidden; }
          .header { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--divider-color); }
          .header-icon { display: flex; align-items: center; justify-content: center; }
          .header-info { flex: 1; min-width: 0; }
          .header-name { font-size: 1em; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .header-sub { font-size: 0.8em; color: var(--secondary-text-color); }
          .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; font-weight: 600; }
          .mqtt-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success-color, #4caf50); display: inline-block; }
          .mqtt-dot.off { background: var(--error-color, #e05c6a); }
          .section { padding: 10px 14px; border-bottom: 1px solid var(--divider-color); }
          .section:last-child { border-bottom: none; }
          .section-label { font-size: 0.72em; font-weight: 700; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
          .mode-buttons { display: flex; gap: 8px; }
          .mode-btn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px; border-radius: 10px; border: 1.5px solid var(--divider-color); background: transparent; cursor: pointer; color: var(--secondary-text-color); font-size: 0.78em; font-family: inherit; transition: all 0.15s; }
          .mode-btn.active { border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3,169,244), 0.12); color: var(--primary-color); }
          .mode-btn:hover:not(.active) { background: var(--secondary-background-color); }
          .session-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .session-item { display: flex; flex-direction: column; gap: 2px; }
          .session-val { font-size: 1.1em; font-weight: 600; }
          .session-key { font-size: 0.75em; color: var(--secondary-text-color); }
          .power-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
          .power-row + .power-row { border-top: 1px solid var(--divider-color); }
          .power-row ha-icon { --mdc-icon-size: 16px; flex-shrink: 0; }
          .power-label { flex: 1; font-size: 0.88em; color: var(--secondary-text-color); }
          .power-val { font-size: 0.88em; font-weight: 600; }
          .controls-row { display: flex; align-items: center; gap: 10px; }
          .charge-toggle { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; border: 1.5px solid var(--divider-color); background: transparent; cursor: pointer; color: var(--secondary-text-color); font-size: 0.82em; font-family: inherit; }
          .charge-toggle.on { border-color: var(--success-color, #4caf50); color: var(--success-color, #4caf50); background: rgba(76,175,80,0.1); }
          .slider-wrap { flex: 1; display: flex; flex-direction: column; gap: 2px; }
          .slider-label { font-size: 0.72em; color: var(--secondary-text-color); display: flex; justify-content: space-between; }
          input[type=range] { width: 100%; accent-color: var(--primary-color); }
        </style>
        <div class="card">
          <div class="header">
            <div class="header-icon">
              <ha-icon icon="mdi:ev-station" style="--mdc-icon-size:28px; color:var(--primary-color);"></ha-icon>
            </div>
            <div class="header-info">
              <div class="header-name">${deviceName}</div>
              <div class="header-sub">
                <span class="badge" style="color:${this._evseColor(evseStatus)};background:${this._evseBackground(evseStatus)};">
                  <ha-icon icon="${isCharging ? "mdi:lightning-bolt" : "mdi:ev-plug-type2"}" style="--mdc-icon-size:12px;"></ha-icon>
                  ${this._t(evseStatus)}
                </span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;font-size:0.75em;color:var(--secondary-text-color);">
              <span class="mqtt-dot ${mqttOn ? "" : "off"}"></span>
              MQTT
            </div>
          </div>

          <div class="section">
            <div class="mode-buttons">
              ${modes.map(m => `
                <button class="mode-btn ${currentMode === m ? "active" : ""}" data-mode="${m}">
                  <ha-icon icon="${modeIcons[m]}" style="--mdc-icon-size:20px;"></ha-icon>
                  ${this._t(m)}
                </button>
              `).join("")}
            </div>
          </div>

          ${show.session && hasCable ? `
          <div class="section">
            <div class="section-label">${this._t("session")}</div>
            <div class="session-grid">
              <div class="session-item">
                <div class="session-val">${this._fmtPower(powerVal)}</div>
                <div class="session-key">${this._t("power")}</div>
              </div>
              <div class="session-item">
                <div class="session-val">${this._fmt(currentVal, "A")}</div>
                <div class="session-key">${this._t("current")}</div>
              </div>
              <div class="session-item">
                <div class="session-val">${this._fmt(sessionEnergy, "kWh", 2)}</div>
                <div class="session-key">${this._t("energy")}</div>
              </div>
              <div class="session-item">
                <div class="session-val">${sessionDuration || "—"}</div>
                <div class="session-key">${this._t("duration")}</div>
              </div>
            </div>
          </div>
          ` : ""}

          ${show.power ? `
          <div class="section">
            <div class="section-label">${this._t("power")}</div>
            <div class="power-row">
              <ha-icon icon="mdi:transmission-tower" style="color:var(--primary-color);"></ha-icon>
              <span class="power-label">${this._t("grid")}</span>
              <span class="power-val">${this._fmtPower(gridPower)}</span>
            </div>
            <div class="power-row">
              <ha-icon icon="mdi:solar-power" style="color:var(--warning-color, #e0956a);"></ha-icon>
              <span class="power-label">${this._t("pv")}</span>
              <span class="power-val">${this._fmtPower(pvPower)}</span>
            </div>
            <div class="power-row">
              <ha-icon icon="mdi:home" style="color:var(--secondary-text-color);"></ha-icon>
              <span class="power-label">${this._t("house")}</span>
              <span class="power-val">${this._fmtPower(housePower)}</span>
            </div>
          </div>
          ` : ""}

          ${show.controls ? `
          <div class="section">
            <div class="controls-row">
              <button class="charge-toggle ${chargingOn ? "on" : ""}" id="charge-toggle-btn">
                <ha-icon icon="${chargingOn ? "mdi:pause" : "mdi:play"}" style="--mdc-icon-size:16px;"></ha-icon>
                ${chargingOn ? "Pause" : "Start"}
              </button>
              <div class="slider-wrap">
                <div class="slider-label">
                  <span>${this._t("current")}</span>
                  <span>${parseFloat(sliderVal).toFixed(1)} A</span>
                </div>
                <input type="range" id="current-slider"
                  min="${sliderMin}" max="${sliderMax}" step="0.1"
                  value="${sliderVal}">
              </div>
            </div>
          </div>
          ` : ""}
        </div>
      </ha-card>
    `;

    this.querySelectorAll(".mode-btn").forEach(btn => {
      btn.addEventListener("click", () => this._setMode(btn.dataset.mode));
    });

    const toggleBtn = this.querySelector("#charge-toggle-btn");
    if (toggleBtn) toggleBtn.addEventListener("click", () => this._toggleCharging(!chargingOn));

    const slider = this.querySelector("#current-slider");
    if (slider) {
      let debounce;
      slider.addEventListener("input", e => {
        clearTimeout(debounce);
        debounce = setTimeout(() => this._setCurrentSlider(parseFloat(e.target.value)), 400);
      });
    }
  }

  getCardSize() { return 4; }
}

class SmappeeEvCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    this._config = { ...config };
    if (this._hass) this._render();
  }

  _devices() {
    if (!this._hass) return [];
    const entities = Object.values(this._hass.entities || {});
    const seen = new Set();
    return entities
      .filter(e => e.platform === "smappee_ev" && e.device_id && !seen.has(e.device_id) && seen.add(e.device_id))
      .map(e => {
        const state = this._hass.states[e.entity_id];
        const name = state?.attributes?.friendly_name?.replace(/\s+(Vermogen|Power|Stroom|Current|Sessie|Session|Laadmodus|Charging mode|EVSE status|EVCC status|Laadstatus|Charging state).*$/i, "").trim() || e.device_id;
        return { id: e.device_id, name };
      });
  }

  _fire(config) {
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  _render() {
    const devices = this._devices();
    const toggles = [
      ["show_session",  "Show session"],
      ["show_power",    "Show power"],
      ["show_controls", "Show controls"],
    ];

    this.innerHTML = `
      <style>
        label { font-size: 0.85em; color: var(--secondary-text-color); display: block; margin-bottom: 4px; }
        select { width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); margin-bottom: 12px; font-size: 0.9em; }
        .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; font-size: 0.88em; }
      </style>
      <label>Device</label>
      <select id="device-select">
        <option value="">— select —</option>
        ${devices.map(d => `<option value="${d.id}" ${this._config.device_id === d.id ? "selected" : ""}>${d.name}</option>`).join("")}
      </select>
      ${toggles.map(([key, label]) => `
        <div class="toggle-row">
          <span>${label}</span>
          <ha-switch id="${key}" ${this._config[key] !== false ? "checked" : ""}></ha-switch>
        </div>
      `).join("")}
    `;

    this.querySelector("#device-select").addEventListener("change", e => {
      this._fire({ ...this._config, device_id: e.target.value });
    });

    toggles.forEach(([key]) => {
      this.querySelector(`#${key}`).addEventListener("change", e => {
        this._fire({ ...this._config, [key]: e.target.checked });
      });
    });
  }
}

customElements.define("smappee-ev-card", SmappeeEvCard);
customElements.define("smappee-ev-card-editor", SmappeeEvCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "smappee-ev-card",
  name: "Smappee EV Card",
  description: "Card for Smappee EV charging stations",
  preview: false,
});

console.info(`%c SMAPPEE-EV-CARD %c v${VERSION} `, "background:#00a1e0;color:#fff;font-weight:700;", "background:#333;color:#fff;");
