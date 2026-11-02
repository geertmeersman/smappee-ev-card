# Smappee EV Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg?style=for-the-badge)](https://github.com/hacs/integration)
[![maintainer](https://img.shields.io/badge/maintainer-Geert%20Meersman-green?style=for-the-badge&logo=github)](https://github.com/geertmeersman)
[![buyme_coffee](https://img.shields.io/badge/Buy%20me%20an%20Omer-donate-yellow?style=for-the-badge&logo=buymeacoffee)](https://www.buymeacoffee.com/geertmeersman)

A Lovelace card for [Home Assistant](https://www.home-assistant.io/) that displays status, session info, power overview and controls for a [Smappee EV](https://www.smappee.com/) charging station.

![screenshot](docs/images/screenshot.png)

## Requirements

- [Smappee EV integration](https://github.com/geertmeersman/smappee_ev) installed

## Installation via HACS

1. Go to HACS → Frontend
2. Click ⋮ → Custom repositories
3. Add: `https://github.com/geertmeersman/smappee-ev-card`
4. Category: `Lovelace`
5. Install "Smappee EV Card"

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=geertmeersman&repository=smappee-ev-card&category=lovelace)

## Configuration

The card has a visual editor — just pick the device from the dropdown.

```yaml
type: custom:smappee-ev-card
device_id: <device_id>
```

### Options

| Option | Default | Description |
|---|---|---|
| `device_id` | required | Smappee EV charging station device ID |
| `show_session` | `true` | Active session info (power, current, energy, phases) |
| `show_power` | `true` | Grid / PV / house / EV power overview |
