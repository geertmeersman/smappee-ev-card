const VERSION = "0.2.0";

class SmappeeEvCard extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._entities = {};
    this._built = false;
    this._sliding = false;
  }

  static getConfigElement() { return document.createElement("smappee-ev-card-editor"); }
  static getStubConfig() { return { device_id: "", show_session: true, show_power: true, show_graph: true }; }

  setConfig(config) {
    this._config = { show_session: true, show_power: true, show_graph: true, ...config };
    this._entities = {};
    this._built = false;
    this._graphCard = null;
    if (this._hass) this._update();
  }

  set hass(hass) {
    const old = this._hass;
    this._hass = hass;
    if (!Object.keys(this._entities).length)
      this._entities = this._entitiesForDevice(this._config.device_id);
    if (!old || this._changed(old, hass)) this._update();
  }

  _changed(a, b) {
    return Object.values(this._entities).filter(Boolean).some(id => a.states[id] !== b.states[id]);
  }

  _entitiesForDevice(deviceId) {
    if (!deviceId || !this._hass) return {};
    const allEntities = Object.values(this._hass.entities || {});
    const allDevices  = this._hass.devices || {};
    const siteDeviceId = (() => {
      let id = deviceId;
      while (allDevices[id]?.via_device_id) id = allDevices[id].via_device_id;
      return id;
    })();
    const forConnector = allEntities.filter(e => e.device_id === deviceId);
    const forSite      = allEntities.filter(e => e.device_id === siteDeviceId);
    const find = (list, k) => (list.find(e => e.entity_id.includes(k) || (e.translation_key && e.translation_key.includes(k))) || {}).entity_id;
    return {
      evse_status:     find(forConnector, "status_current"),
      power:           find(forConnector, "power_total"),
      current:         find(forConnector, "current_total"),
      current_l1:      find(forConnector, "current_l1"),
      current_l2:      find(forConnector, "current_l2"),
      current_l3:      find(forConnector, "current_l3"),
      session_energy:  find(forConnector, "session_energy"),
      charging_mode:   find(forConnector, "charging_mode"),
      charging_switch: find(forConnector, "evcc_charging"),
      current_slider:  find(forConnector, "max_charging_speed"),
      resume_charging: find(forConnector, "resume_charging"),
      surplus_slider:  find(forConnector, "min_surpluspct"),
      grid_power:      find(forSite, "grid_power"),
      pv_power:        find(forSite, "pv_power"),
      house_power:     find(forSite, "house_consumption_power"),
      mqtt_connected:  find(forSite, "mqtt_connected"),
      capacity_power:  find(forSite, "capacity_maximum_power"),
    };
  }

  _val(id) { return (id && this._hass?.states[id]?.state) || null; }
  _attr(id, a) { return (id && this._hass?.states[id]?.attributes[a]) || null; }

  _t(k) {
    const lang = (this._hass?.locale?.language || "en").slice(0, 2).toLowerCase();
    const nl = { standard:"Standaard", smart:"Slim", solar:"Zonne-energie", session:"Sessie",
      power:"Vermogen", grid:"Net", pv:"PV", house:"Huis", ev:"EV", current:"Stroom",
      energy:"Energie", phases:"Fases", surplus:"Min. overschot", capacity:"Max. capaciteit", no_device:"Kies een device in de editor.",
      charging:"Laden", available:"Beschikbaar", cable_connected:"Kabel verbonden",
      charging_finished:"Laden voltooid", error:"Fout", suspended_evse:"Onderbroken",
      initialize:"Initialiseren", start:"Start", pause:"Pauzeer het laden", resume:"Hervat het laden", stop:"Stop" };
    const de = { standard:"Standard", smart:"Smart", solar:"Solarenergie", session:"Sitzung",
      power:"Leistung", grid:"Netz", pv:"PV", house:"Haus", ev:"EV", current:"Strom",
      energy:"Energie", phases:"Phasen", surplus:"Min. Überschuss", capacity:"Max. Kapazität", no_device:"Gerät im Editor auswählen.",
      charging:"Lädt", available:"Verfügbar", cable_connected:"Kabel angeschlossen",
      charging_finished:"Ladevorgang abgeschlossen", error:"Fehler", suspended_evse:"Vom Ladegerät pausiert",
      initialize:"Initialisierung", start:"Start", pause:"Pause", resume:"Fortsetzen", stop:"Stopp" };
    const fr = { standard:"Standard", smart:"Intelligent", solar:"Solaire", session:"Session",
      power:"Puissance", grid:"Réseau", pv:"PV", house:"Maison", ev:"VE", current:"Courant",
      energy:"Énergie", phases:"Phases", surplus:"Surplus min.", capacity:"Capacité max.", no_device:"Choisissez un appareil dans l'éditeur.",
      charging:"En charge", available:"Disponible", cable_connected:"Câble connecté",
      charging_finished:"Charge terminée", error:"Erreur", suspended_evse:"Suspendu par le chargeur",
      initialize:"Initialisation", start:"Démarrer", pause:"Pause", resume:"Reprendre", stop:"Arrêter" };
    const en = { standard:"Standard", smart:"Smart", solar:"Solar", session:"Session",
      power:"Power", grid:"Grid", pv:"PV", house:"House", ev:"EV", current:"Current",
      energy:"Energy", phases:"Phases", surplus:"Min. surplus", capacity:"Max. capacity", no_device:"Pick a device in the editor.",
      charging:"Charging", available:"Available", cable_connected:"Cable connected",
      charging_finished:"Charging finished", error:"Error", suspended_evse:"Suspended",
      initialize:"Initializing", start:"Start", pause:"Pause", resume:"Resume", stop:"Stop" };
    return ({nl, de, fr}[lang] || en)[k] || en[k] || k;
  }

  _evseColor(s) {
    return { charging:"var(--success-color,#4caf50)", cable_connected:"var(--warning-color,#e0956a)",
      error:"var(--error-color,#e05c6a)", suspended_evse:"var(--warning-color,#e0956a)",
      charging_finished:"var(--info-color,#2196f3)" }[s] || "var(--secondary-text-color)";
  }

  _evseBg(s) {
    return { charging:"rgba(76,175,80,0.15)", cable_connected:"rgba(224,149,106,0.15)",
      error:"rgba(224,92,106,0.15)", suspended_evse:"rgba(224,149,106,0.15)",
      charging_finished:"rgba(33,150,243,0.15)" }[s] || "var(--secondary-background-color)";
  }

  _fmtPower(v, entityId) {
    const n = parseFloat(v);
    if (isNaN(n)) return "—";
    const unit = (entityId && this._hass?.states[entityId]?.attributes?.unit_of_measurement) || "W";
    const w = unit === "kW" ? n * 1000 : n;
    return Math.abs(w) >= 1000 ? `${(w/1000).toFixed(2)} kW` : `${Math.round(w)} W`;
  }

  _fmt(v, unit, p=1) {
    if (!v || v === "unavailable" || v === "unknown") return "—";
    const n = parseFloat(v);
    return isNaN(n) ? v : `${n.toFixed(p)} ${unit}`;
  }

  _deviceName() {
    const id = Object.values(this._entities).find(id => id && this._hass.states[id]);
    return id ? (this._hass.states[id].attributes.friendly_name || "")
      .replace(/\s+(Vermogen|Power|Stroom|Current|Sessie|Session|Laadmodus|Charging mode|EVSE status|EVCC status|Laadstatus|Charging state).*$/i, "").trim()
      : "Smappee EV";
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  async _setMode(mode) {
    const id = this._entities.charging_mode;
    if (id) await this._hass.callService("select", "select_option", { entity_id: id, option: mode });
  }

  async _setSlider(v) {
    const id = this._entities.current_slider;
    if (!id) return;
    const num = Math.round(parseFloat(String(v)) * 10) / 10;
    const domain = id.split(".")[0];
    console.log("set_value", domain, id, num, typeof num);
    await this._hass.callService(domain, "set_value", { entity_id: id, value: num });
  }

  async _callSwitch(action) {
    const id = this._entities.charging_switch;
    if (id) await this._hass.callService("switch", action, { entity_id: id });
  }

  async _callButton(entityKey) {
    const id = this._entities[entityKey];
    if (id) await this._hass.callService("button", "press", { entity_id: id });
  }

  _build() {
    const show = {
      session:  this._config.show_session !== false,
      power:    this._config.show_power !== false,
      graph:    this._config.show_graph !== false,
    };
    const sliderState = this._hass?.states[this._entities.current_slider];
    const sliderMin = sliderState?.attributes?.min ?? 6;
    const sliderMax = sliderState?.attributes?.max ?? 32;
    const sliderVal = this._val(this._entities.current_slider) ?? sliderMin;

    this.innerHTML = `
      <ha-card>
        <style>
          .card{background:var(--card-background-color);color:var(--primary-text-color);font-family:var(--paper-font-body1_-_font-family);border-radius:var(--ha-card-border-radius,12px);overflow:hidden}
          .header{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--divider-color)}
          .header-info{flex:1;min-width:0}
          .header-name{font-size:1em;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .header-sub{font-size:0.8em;color:var(--secondary-text-color)}
          .badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:0.75em;font-weight:600}
          .mqtt-dot{width:7px;height:7px;border-radius:50%;display:inline-block}
          .section{padding:10px 14px;border-bottom:1px solid var(--divider-color)}
          .section:last-child{border-bottom:none}
          .section-label{font-size:0.72em;font-weight:700;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px}
          .mode-buttons{display:flex;gap:8px}
          .mode-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:10px;border:1.5px solid var(--divider-color);background:transparent;cursor:pointer;color:var(--secondary-text-color);font-size:0.78em;font-family:inherit;transition:all 0.15s}
          .mode-btn.active{border-color:var(--primary-color);background:rgba(var(--rgb-primary-color,3,169,244),0.12);color:var(--primary-color)}
          .mode-btn:hover:not(.active){background:var(--secondary-background-color)}
          .session-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
          .session-val{font-size:1.1em;font-weight:600}
          .session-key{font-size:0.75em;color:var(--secondary-text-color)}
          .power-row{display:flex;align-items:center;gap:8px;padding:4px 0}
          .power-row+.power-row{border-top:1px solid var(--divider-color)}
          .power-row ha-icon{--mdc-icon-size:16px;flex-shrink:0}
          .power-label{flex:1;font-size:0.88em;color:var(--secondary-text-color)}
          .power-val{font-size:0.88em;font-weight:600}
          .controls-row{display:flex;align-items:center;gap:10px}
          .ctrl-btn{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;border:1.5px solid var(--divider-color);background:transparent;cursor:pointer;font-size:0.82em;font-family:inherit;white-space:nowrap;color:var(--secondary-text-color)}
          .ctrl-btn.start{border-color:var(--success-color,#4caf50);color:var(--success-color,#4caf50);background:rgba(76,175,80,0.1)}
          .ctrl-btn.pause{border-color:var(--warning-color,#e0956a);color:var(--warning-color,#e0956a);background:rgba(224,149,106,0.1)}
          .ctrl-btn.stop{border-color:var(--error-color,#e05c6a);color:var(--error-color,#e05c6a);background:rgba(224,92,106,0.1)}
          .slider-wrap{flex:1;display:flex;flex-direction:column;gap:2px}
          .slider-label{font-size:0.72em;color:var(--secondary-text-color);display:flex;justify-content:space-between}
          input[type=range]{width:100%;accent-color:var(--primary-color)}
        </style>
        <div class="card">
          <div class="header">
            <img src="/hacsfiles/smappee-ev-card/icon.png" style="width:28px;height:28px;flex-shrink:0;border-radius:4px" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><ha-icon icon="mdi:ev-station" style="--mdc-icon-size:28px;color:var(--primary-color);flex-shrink:0;display:none"></ha-icon>
            <div class="header-info">
              <div class="header-name" id="dev-name"></div>
              <div class="header-sub"><span class="badge" id="evse-badge"></span></div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;font-size:0.75em;color:var(--secondary-text-color);flex-shrink:0">
              <span class="mqtt-dot" id="mqtt-dot"></span>MQTT
            </div>
          </div>

          <div class="section">
            <div class="mode-buttons">
              <button class="mode-btn" id="btn-standard" data-mode="standard">
                <ha-icon icon="mdi:lightning-bolt" style="--mdc-icon-size:20px"></ha-icon>${this._t("standard")}
              </button>
              <button class="mode-btn" id="btn-smart" data-mode="smart">
                <ha-icon icon="mdi:brain" style="--mdc-icon-size:20px"></ha-icon>${this._t("smart")}
              </button>
              <button class="mode-btn" id="btn-solar" data-mode="solar">
                <ha-icon icon="mdi:solar-power" style="--mdc-icon-size:20px"></ha-icon>${this._t("solar")}
              </button>
            </div>
            <div id="current-wrap" style="display:none;margin-top:10px">
              <div class="slider-label">
                <span>${this._t("current")}</span>
                <span id="slider-label-val">${parseFloat(sliderVal).toFixed(1)} A</span>
              </div>
              <input type="range" id="current-slider" min="${sliderMin}" max="${sliderMax}" step="0.1" value="${sliderVal}">
            </div>
            <div id="surplus-wrap" style="display:none;margin-top:10px">
              <div class="slider-label">
                <span>${this._t("surplus")}</span>
                <span id="surplus-label-val">— %</span>
              </div>
              <input type="range" id="surplus-slider" min="0" max="100" step="1" value="100">
            </div>
            <div id="action-btns" style="display:none;margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
              <button class="ctrl-btn start" id="btn-start" style="display:none">
                <ha-icon icon="mdi:play" style="--mdc-icon-size:16px"></ha-icon>${this._t("start")}
              </button>
              <button class="ctrl-btn pause" id="btn-pause" style="display:none">
                <ha-icon icon="mdi:pause" style="--mdc-icon-size:16px"></ha-icon>${this._t("pause")}
              </button>
              <button class="ctrl-btn start" id="btn-resume" style="display:none">
                <ha-icon icon="mdi:play" style="--mdc-icon-size:16px"></ha-icon>${this._t("resume")}
              </button>
              <button class="ctrl-btn stop" id="btn-stop" style="display:none">
                <ha-icon icon="mdi:stop" style="--mdc-icon-size:16px"></ha-icon>${this._t("stop")}
              </button>
            </div>
          </div>

          ${show.graph ? `
          <div class="section" id="graph-section" style="padding:0">
            <div id="power-graph-container"></div>
          </div>` : ""}

          ${show.session ? `
          <div class="section" id="session-section">
            <div class="section-label">${this._t("session")}</div>
            <div class="session-grid">
              <div><div class="session-val" id="s-power">—</div><div class="session-key">${this._t("power")}</div></div>
              <div><div class="session-val" id="s-current">—</div><div class="session-key">${this._t("current")}</div></div>
              <div><div class="session-val" id="s-energy">—</div><div class="session-key">${this._t("energy")}</div></div>
              <div><div class="session-val" id="s-phases">—</div><div class="session-key">${this._t("phases")}</div></div>
              <div style="grid-column:1/-1"><div class="session-val" id="s-rfid" style="font-size:0.85em">—</div><div class="session-key">RFID</div></div>
            </div>
          </div>` : ""}

          ${show.power ? `
          <div class="section">
            <div class="power-row">
              <ha-icon icon="mdi:transmission-tower" style="color:var(--primary-color)"></ha-icon>
              <span class="power-label">${this._t("grid")}</span>
              <span class="power-val" id="p-grid">—</span>
            </div>
            <div class="power-row">
              <ha-icon icon="mdi:solar-power" style="color:var(--warning-color,#e0956a)"></ha-icon>
              <span class="power-label">${this._t("pv")}</span>
              <span class="power-val" id="p-pv">—</span>
            </div>
            <div class="power-row">
              <ha-icon icon="mdi:home" style="color:var(--secondary-text-color)"></ha-icon>
              <span class="power-label">${this._t("house")}</span>
              <span class="power-val" id="p-house">—</span>
            </div>
            <div class="power-row">
              <ha-icon icon="mdi:car-electric" style="color:var(--success-color,#4caf50)"></ha-icon>
              <span class="power-label">${this._t("ev")}</span>
              <span class="power-val" id="p-ev">—</span>
            </div>
            <div class="power-row" id="p-capacity-row" style="cursor:pointer">
              <ha-icon icon="mdi:transmission-tower-export" style="color:var(--secondary-text-color)"></ha-icon>
              <span class="power-label">${this._t("capacity")}</span>
              <span class="power-val" id="p-capacity">—</span>
            </div>
          </div>` : ""}

        </div>
      </ha-card>`;

    this.querySelectorAll(".mode-btn").forEach(btn =>
      btn.addEventListener("click", () => this._setMode(btn.dataset.mode))
    );
    this.querySelector("#btn-start")?.addEventListener("click", () => this._callSwitch("turn_on"));
    this.querySelector("#btn-pause")?.addEventListener("click", () => this._callSwitch("turn_off"));
    this.querySelector("#btn-resume")?.addEventListener("click", () => this._callButton("resume_charging"));
    this.querySelector("#btn-stop")?.addEventListener("click",  () => this._callSwitch("turn_off"));
    this.querySelector("#p-capacity-row")?.addEventListener("click", () => this._moreInfo(this._entities.capacity_power));

    const slider = this.querySelector("#current-slider");
    if (slider) {
      let debounce;
      slider.addEventListener("pointerdown", () => { this._sliding = true; });
      slider.addEventListener("pointerup",   () => { this._sliding = false; });
      slider.addEventListener("input", ev => {
        const val = parseFloat(ev.target.value);
        this.querySelector("#slider-label-val").textContent = `${val.toFixed(1)} A`;
        clearTimeout(debounce);
        debounce = setTimeout(() => this._setSlider(val), 500);
      });
    }

    const surplusSlider = this.querySelector("#surplus-slider");
    if (surplusSlider) {
      let debounce;
      surplusSlider.addEventListener("pointerdown", () => { this._sliding = true; });
      surplusSlider.addEventListener("pointerup",   () => { this._sliding = false; });
      surplusSlider.addEventListener("input", ev => {
        const val = parseFloat(ev.target.value);
        console.log("surplus input", ev.target.value, typeof ev.target.value, val);
        this.querySelector("#surplus-label-val").textContent = `${ev.target.value} %`;
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const id = this._entities.surplus_slider;
          if (!id) return;
          const domain = id.split(".")[0];
          console.log("surplus set_value", domain, id, val, typeof val);
          this._hass.callService(domain, "set_value", { entity_id: id, value: val });
        }, 500);
      });
    }

    this._built = true;
  }

  _update() {
    if (!this._hass || !this._config.device_id) {
      this.innerHTML = `<ha-card><div style="padding:16px;color:var(--secondary-text-color);">${this._t("no_device")}</div></ha-card>`;
      this._built = false;
      return;
    }
    if (!this._built) this._build();

    const e = this._entities;
    const evseStatus  = this._val(e.evse_status) || "initialize";
    const currentMode = this._val(e.charging_mode);
    const mqttOn      = this._val(e.mqtt_connected) === "on";
    const isCharging  = evseStatus === "charging";
    const hasCable    = ["charging","cable_connected","charging_finished","suspended_evse"].includes(evseStatus);

    // Header
    const nameEl = this.querySelector("#dev-name");
    if (nameEl) nameEl.textContent = this._deviceName();

    const badge = this.querySelector("#evse-badge");
    if (badge) {
      badge.textContent = this._t(evseStatus);
      badge.style.color = this._evseColor(evseStatus);
      badge.style.background = this._evseBg(evseStatus);
    }

    const dot = this.querySelector("#mqtt-dot");
    if (dot) dot.style.background = mqttOn ? "var(--success-color,#4caf50)" : "var(--error-color,#e05c6a)";

    // Mode buttons
    ["standard","smart","solar"].forEach(m => {
      this.querySelector(`#btn-${m}`)?.classList.toggle("active", currentMode === m);
    });

    // Session
    const sessionSection = this.querySelector("#session-section");
    if (sessionSection) {
      sessionSection.style.display = hasCable ? "" : "none";
      if (hasCable) {
        this.querySelector("#s-power").textContent   = this._fmtPower(this._val(e.power), e.power);
        this.querySelector("#s-current").textContent = this._fmt(this._val(e.current), "A");
        this.querySelector("#s-energy").textContent  = this._fmt(this._val(e.session_energy), "kWh", 2);
        const phases = [e.current_l1, e.current_l2, e.current_l3]
          .filter(id => parseFloat(this._val(id)) > 0).length;
        this.querySelector("#s-phases").textContent  = phases > 0 ? `${phases}` : "—";
        const rfid = this._attr(e.session_energy, "rfid");
        this.querySelector("#s-rfid").textContent = rfid || "—";
      }
    }

    // Graph
    const graphContainer = this.querySelector("#power-graph-container");
    if (graphContainer && this._entities.power) {
      if (!this._graphCard) {
        (async () => {
          const helpers = await window.loadCardHelpers();
          this._graphCard = await helpers.createCardElement({
            type: "custom:mini-graph-card",
            entities: [{ entity: this._entities.power }],
            hours_to_show: 24,
            points_per_hour: 4,
            line_width: 2,
            smoothing: true,
            group: true,
            show: { legend: false, name: false, icon: false, state: false, labels: false },
            color: "orange",
            height: 60,
          });
          this._graphCard.hass = this._hass;
          graphContainer.appendChild(this._graphCard);
        })();
      } else {
        this._graphCard.hass = this._hass;
      }
    }

    // Power
    const pg = this.querySelector("#p-grid");  if (pg) pg.textContent = this._fmtPower(this._val(e.grid_power), e.grid_power);
    const pp = this.querySelector("#p-pv");    if (pp) pp.textContent = this._fmtPower(this._val(e.pv_power), e.pv_power);
    const ph = this.querySelector("#p-house"); if (ph) ph.textContent = this._fmtPower(this._val(e.house_power), e.house_power);
    const pe = this.querySelector("#p-ev");    if (pe) pe.textContent = this._fmtPower(this._val(e.power), e.power);
    const pc = this.querySelector("#p-capacity"); if (pc) pc.textContent = this._fmt(this._val(e.capacity_power), "kW", 1);

    // Controls — show/hide buttons based on status and mode
    const isSolar   = currentMode === "solar";
    const isSuspended = evseStatus === "suspended_evse";
    const btnStart  = this.querySelector("#btn-start");
    const btnPause  = this.querySelector("#btn-pause");
    const btnResume = this.querySelector("#btn-resume");
    const btnStop   = this.querySelector("#btn-stop");
    if (btnStart)  btnStart.style.display  = "none";
    if (btnPause)  btnPause.style.display  = isCharging && !isSolar ? "" : "none";
    if (btnResume) btnResume.style.display = isSuspended ? "" : "none";
    if (btnStop)   btnStop.style.display   = "none";

    // Show action buttons row when any button is visible
    const actionBtns = this.querySelector("#action-btns");
    if (actionBtns) actionBtns.style.display = (hasCable && !isSolar) ? "flex" : "none";

    // Current slider — only show in standard mode
    const currentWrap = this.querySelector("#current-wrap");
    if (currentWrap) currentWrap.style.display = currentMode === "standard" ? "" : "none";

    // Surplus slider — show under mode buttons only in solar mode
    const surplusWrap = this.querySelector("#surplus-wrap");
    if (surplusWrap) surplusWrap.style.display = (currentMode === "solar" || currentMode === "smart") ? "" : "none";

    // Slider — only current slider in controls
    if (!this._sliding) {
      const slider = this.querySelector("#current-slider");
      const sliderVal = this._val(e.current_slider);
      if (slider && sliderVal !== null) {
        slider.value = sliderVal;
        const lv = this.querySelector("#slider-label-val");
        if (lv) lv.textContent = `${parseFloat(sliderVal).toFixed(1)} A`;
      }
      const surplusSlider = this.querySelector("#surplus-slider");
      const surplusVal = this._val(e.surplus_slider);
      if (surplusSlider && surplusVal !== null) {
        surplusSlider.value = surplusVal;
        const lv = this.querySelector("#surplus-label-val");
        if (lv) lv.textContent = `${surplusVal} %`;
      }
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
    if (!this.querySelector("#device-select")) this._render();
  }

  setConfig(config) {
    this._config = { ...config };
    if (this._hass) this._render();
  }

  _devices() {
    if (!this._hass) return [];
    const seen = new Set();
    return Object.values(this._hass.entities || {})
      .filter(e => e.platform === "smappee_ev" && e.device_id && !seen.has(e.device_id) && seen.add(e.device_id))
      .filter(e => (this._hass.devices?.[e.device_id]?.model || "").toLowerCase().includes("connector"))
      .map(e => ({
        id: e.device_id,
        name: this._hass.devices?.[e.device_id]?.name_by_user || this._hass.devices?.[e.device_id]?.name || e.device_id
      }));
  }

  _fire(config) {
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  _t(k) {
    const lang = (this._hass?.locale?.language || "en").slice(0, 2).toLowerCase();
    const nl = { show_session:"Sessie tonen", show_power:"Vermogen tonen", show_graph:"Grafiek tonen", device:"Apparaat" };
    const de = { show_session:"Sitzung anzeigen", show_power:"Leistung anzeigen", show_graph:"Diagramm anzeigen", device:"Gerät" };
    const fr = { show_session:"Afficher la session", show_power:"Afficher la puissance", show_graph:"Afficher le graphique", device:"Appareil" };
    const en = { show_session:"Show session", show_power:"Show power", show_graph:"Show graph", device:"Device" };
    return ({nl, de, fr}[lang] || en)[k] || en[k] || k;
  }

  _render() {
    const devices = this._devices();
    const toggles = [["show_graph", this._t("show_graph")],["show_session", this._t("show_session")],["show_power", this._t("show_power")]];
    this.innerHTML = `
      <style>
        label{font-size:0.85em;color:var(--secondary-text-color);display:block;margin-bottom:4px}
        select{width:100%;padding:6px 8px;border-radius:6px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);margin-bottom:12px;font-size:0.9em}
        .toggle-row{display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:0.88em}
      </style>
      <label>${this._t("device")}</label>
      <select id="device-select">
        <option value="">— select —</option>
        ${devices.map(d => `<option value="${d.id}" ${this._config.device_id === d.id ? "selected" : ""}>${d.name}</option>`).join("")}
      </select>
      ${toggles.map(([k,l]) => `<div class="toggle-row"><span>${l}</span><ha-switch id="${k}" ${this._config[k] !== false ? "checked" : ""}></ha-switch></div>`).join("")}`;

    this.querySelector("#device-select").addEventListener("change", e =>
      this._fire({ ...this._config, device_id: e.target.value })
    );
    toggles.forEach(([k]) =>
      this.querySelector(`#${k}`).addEventListener("change", e =>
        this._fire({ ...this._config, [k]: e.target.checked })
      )
    );
  }
}

customElements.define("smappee-ev-card", SmappeeEvCard);
customElements.define("smappee-ev-card-editor", SmappeeEvCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({ type: "smappee-ev-card", name: "Smappee EV Card", description: "Card for Smappee EV charging stations", preview: false });

console.info(`%c SMAPPEE-EV-CARD %c v${VERSION} `, "background:#00a1e0;color:#fff;font-weight:700;", "background:#333;color:#fff;");
