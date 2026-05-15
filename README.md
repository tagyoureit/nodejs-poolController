# nodejs-poolController (njsPC)

[![License: AGPL v3](https://img.shields.io/github/license/tagyoureit/nodejs-poolController)](https://www.gnu.org/licenses/agpl-3.0)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org/)
[![GitHub release](https://img.shields.io/github/v/release/tagyoureit/nodejs-poolController)](https://github.com/tagyoureit/nodejs-poolController/releases)
[![GitHub stars](https://img.shields.io/github/stars/tagyoureit/nodejs-poolController?style=social)](https://github.com/tagyoureit/nodejs-poolController/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/tagyoureit/nodejs-poolController)](https://github.com/tagyoureit/nodejs-poolController/commits/master)
[![GitHub Discussions](https://img.shields.io/github/discussions/tagyoureit/nodejs-poolController)](https://github.com/tagyoureit/nodejs-poolController/discussions)

**Local, open-source control for Pentair IntelliCenter / IntelliTouch / EasyTouch, Jandy Aqualink, Hayward, and standalone pool equipment.** A self-hosted alternative to the Pentair Home and ScreenLogic cloud apps — your data stays on your network, your pool responds in real time, and your smart home can finally see it.

- 🌊 **Works with your gear** — IntelliCenter (through firmware v3.008), IntelliTouch, EasyTouch, SunTouch, Aqualink, IntelliCom, or no controller at all (Nixie mode).
- 🏠 **Plugs into your smart home** — HomeKit/Siri (via Homebridge), Home Assistant (via MQTT), Hubitat, SmartThings, MQTT, InfluxDB, Alexa.
- 🔌 **No cloud required** — runs on a Raspberry Pi, NAS, or any Node.js 20+ host. Pairs with [dashPanel](https://github.com/rstrouse/nodejs-poolController-dashPanel) for a web dashboard and [REM](https://github.com/rstrouse/relayEquipmentManager) for direct GPIO/i2c/SPI hardware I/O.

<p align="center">
  <img src="https://tagyoureit.github.io/nodejs-poolController/images/v6/clients/dashPanel.png?raw=true" alt="dashPanel UI showing a live njsPC dashboard with bodies, circuits, pumps, and chemistry" width="720">
  <br>
  <em>UI pictured: <a href="https://github.com/rstrouse/nodejs-poolController-dashPanel">dashPanel</a>, the recommended web client.</em>
</p>

> **Quick start (Docker):** see [Docker Compose](#docker-compose-controller--optional-dashpanel-ui) — one file, `docker compose up -d`, done.
> **Quick start (source):** `git clone` → `npm install` → `npm start`. Full steps in [Installation](#installation-instructions).
> **Hardware needed:** an [RS-485 adapter](https://github.com/tagyoureit/nodejs-poolController/wiki/RS-485-Adapter-Details) (or a ScreenLogic network connection) to talk to your equipment.

> **In the wild:** featured in the [TroubleFreePool IntelliCenter walk-through guide](https://www.troublefreepool.com/threads/pentair-intellicenter-pool-control-dashboard-instructional-guide.218514/) (thanks @MyAZPool). Actively maintained — questions welcome in [GitHub Discussions](https://github.com/tagyoureit/nodejs-poolController/discussions).

```diff
+ Running IntelliCenter v3.008+? Fully supported as of 9.0, with security,
+ heater, and chemistry improvements in 9.1.
+ If anything looks off, please open a discussion with a replay capture.
```

## What is njsPC?

njsPC is a Node.js service that talks to your pool controller over RS-485 (or ScreenLogic) and exposes everything — circuits, bodies, pumps, heaters, chlorinators, chemistry, lights, covers, valves, schedules — as a live REST + WebSocket API. Point a [web client](#web-clients) at it for a browser UI, or wire it into [home automation](#home-automation-bindings) so your pool shows up next to your lights and thermostats.

- Want to add a low-cost controller to your pool?
- Want a modern web interface for your existing system?
- Want to turn pumps on remotely, or schedule them on sunrise/sunset?
- Want your home automation hub to read and control your pool?
- Want to run pumps or a chlorinator with **no** pool controller at all?

## Equipment supported

| Category | Supported | Notes |
|---|---|---|
| **Controllers** | IntelliCenter, IntelliTouch, EasyTouch, SunTouch, Aqualink, IntelliCom, Nixie (standalone) | RS-485 (preferred) or ScreenLogic (network) |
| **Pumps** | IntelliFlo VS / VSF / VF, IntelliFlo VS+SVRS, SuperFlo VS, Hayward Eco/TriStar VS, Hayward Relay VS, Whisperflo, single/two-speed, relay-controlled, Neptune Modbus, Regal (Century) Modbus | Regal added in 9.0 — [PR #1169](https://github.com/tagyoureit/nodejs-poolController/pull/1169) |
| **Heaters** | Gas, solar, heat pump, hybrid (ETi / ETi250), MasterTemp, Max-E-Therm, UltraTemp / UltraTempDirect, Jandy JXi / LXi | JXi/LXi added in 9.1 — [discussion #1128](https://github.com/tagyoureit/nodejs-poolController/discussions/1128) |
| **Chlorinators** | IntelliChlor, Aqua-Rite, OEM brands (physical and virtual) | Dual chlorinators supported via REM. Virtual chlorinator added in 9.1 |
| **Lights** | IntelliBrite, MagicStream, Jandy WaterColors, Hayward ColorLogic, Pooltone (Florida Sunseeker), plus legacy SAM / SAL / Color Wheel / Photon Gen | |
| **Chemistry** | IntelliChem (OCP-paired, standalone, and virtual), Relay Equipment Manager (REM) | Atlas Scientific pH / ORP / EC probes, flow, pressure, temperature via REM. Virtual IntelliChem added in 9.1 |
| **Covers** | IntelliCenter cover configuration & control | Live-state feedback is limited on ICv3 |
| **Filters** | Configuration, pressure monitoring, clean/dirty thresholds | |
| **Valves** | Standard intake/return with diverted status | Intellivalve planned |
| **Home Automation** | HomeKit/Siri (Homebridge), Home Assistant (via MQTT), Hubitat, SmartThings, MQTT, InfluxDB, ISY, Vera, Alexa | See [Home Automation Bindings](#home-automation-bindings) |

## What's new in 9.1

9.1 adds IntelliCenter security, Jandy JXi/LXi heater support, virtual chemistry equipment, and a batch of v3.008 refinements.

1. **IntelliCenter security** — full PIN-based role management (up to 9 roles, 22-section granular permissions) with session timeout, server-side write protection, and dashPanel integration (guest mode, lock icon, per-widget gating).
2. **Jandy JXi / LXi heater protocol** — RS-485 support with fault message handling, bitmask burner-on detection, and correct default addresses ([discussion #1128](https://github.com/tagyoureit/nodejs-poolController/discussions/1128)).
3. **Virtual IntelliChem** — alarm sync and API routes for testing chemistry without hardware.
4. **Virtual chlorinator** — full emulation of chlorinator protocol responses.
5. **Alert notification management** — PUT `/config/alerts` endpoint for all 7 alert categories with dashPanel accordion UI and ICP→dashPanel real-time sync.
6. **v3 light sequencing** — IntelliBrite gray-out state propagates to dashPanel during theme changes; light group Swim/Set/Sync uses v3 A184 protocol.
7. **Freeze protection** — manual override detection (per-body bitmask), smart body toggle, and dashPanel freeze/override indicators.
8. **v3 delay configuration** — freeze cycle time, valve delay, and cooldown delay decoded and writable; cancel delay endpoint added.
9. **Remote control & cover configuration** — virtualCircuits byteValueMap corrected, cover circuit IDs fixed, homepage Covers section added.
10. **Zip-to-coordinates fallback** — heliotrope sunrise/sunset calculations now resolve lat/lon from zip code when not explicitly configured.
11. Configurable single mixing period for chemistry controllers — thanks to @johnny2678 ([PR #1181](https://github.com/tagyoureit/nodejs-poolController/pull/1181)).
12. IntelliCenter/IntelliTouch i9+3 disambiguation fix ([#1179](https://github.com/tagyoureit/nodejs-poolController/issues/1179)), 3rd power center expansion fix ([#1171](https://github.com/tagyoureit/nodejs-poolController/issues/1171)), chlorinator ID fallback fix — thanks to @johnny2678 ([PR #1178](https://github.com/tagyoureit/nodejs-poolController/pull/1178)).

See the full [Changelog](https://github.com/tagyoureit/nodejs-poolController/blob/master/Changelog) for all 37 items in 9.1.

<details>
<summary>What was new in 9.0</summary>

9.0 focused on IntelliCenter v3.008 firmware compatibility and finished the v3 work started in 8.4.1.

1. IntelliCenter v3.008 chlorinator support, including live-edit changes coming back from the panel.
2. Faster state updates on v3 — circuit, feature, and body changes made at the panel now appear in dashPanel within seconds.
3. v3 heater enhancements, including ETi250 support and broader heater control coverage.
4. v3 body and unit handling improvements, so capacity and English/Metric changes stay in sync between njsPC and the OCP.
5. Light group state fixes: themes, colors, and ON/OFF transitions sync correctly with the panel.
6. Firmware change detection — njsPC reloads its configuration automatically when the OCP firmware version changes.
7. Virtual equipment management with new REST endpoints.
8. Regal (Century) Modbus pump added, with collision detection and NACK/fault handling on Go/Stop commands — thanks to @celestinjr ([PR #1169](https://github.com/tagyoureit/nodejs-poolController/pull/1169)).
</details>

For earlier releases (8.4.x, 8.3, 8.1, 8.0, 7.x and before), see the [Changelog](https://github.com/tagyoureit/nodejs-poolController/blob/master/Changelog).

<a name="module_nodejs-poolController--install"></a>

## Installation Instructions

> 🔌 **Before you start — hardware required**
> njsPC needs a way to reach your pool bus:
> - **RS-485 adapter** (recommended) — see the [adapter details wiki](https://github.com/tagyoureit/nodejs-poolController/wiki/RS-485-Adapter-Details).
> - **ScreenLogic** (network connection) — if you already have a Pentair ScreenLogic box on your network.
> - **IntelliCenter v3 local WebSocket** (network connection, no adapter) — see [Local Network Comms (IntelliCenter v3)](#local-network-comms-intellicenter-v3) below.
> - **Socat** — to bridge a remote serial device, see the [Socat wiki](https://github.com/tagyoureit/nodejs-poolController/wiki/Socat).

### Local Network Comms (IntelliCenter v3)

IntelliCenter v3.004+ exposes a JSON WebSocket API on **port 6680** of the OCP. njsPC can use this as an alternative to RS-485 — no adapter, no wiring. Configure it from the dashPanel comms page by selecting port type **IntelliCenter Network**, hitting **Discover** to mDNS-browse the LAN, and **Save**.

Prerequisites
- The OCP must have ethernet connected and **"Web and Mobile Interface" enabled** in OCP settings.
- v3.004 firmware or newer.
- Your njsPC host must reach the OCP on port 6680 over the LAN (no firewall in between, no routing across subnets unless you've explicitly allowed it).

How it works
- **Discovery** — mDNS browse for `Pentair -i -n<alias>` advertised under `_http._tcp.local`. The Discover button calls `GET /config/options/ocpws/search`.
- **Bootstrap** — on connect, njsPC issues a `GetParamList objnam:"ALL"` to enumerate the panel and a `RequestParamList` to subscribe for live `NotifyList` push updates.
- **Mutual exclusion with RS-485** — only one transport is ever live at once. When you switch to IntelliCenter Network, all RS-485 ports are closed; switching back closes the WebSocket. A defense-in-depth guard in `Comms.queueSendMessageAsync` rejects any RS-485 frame while WS is the active transport, and the WS client rejects sends while any RS-485 port is open. There is no scenario where both buses are written to in the same process.

⚠️ **Security warning — local WS has no authentication.** Any device on your LAN can read **and write** the full IntelliCenter object model on port 6680, including the PIN-based PERMIT roles in plaintext. Treat port 6680 as **trusted-LAN-only**:
- Do not port-forward 6680 to the internet.
- Place the OCP on a network segment that only trusted devices can reach.
- Anyone on the same LAN as the OCP can change schedules, toggle bodies, and read/modify PINs regardless of njsPC.

Out of scope
- Regal/Neptune Modbus pumps continue to talk over their existing direct-Modbus path; they were never on the IC bus.


njsPC is the server. To actually use it you'll also want a [web client](#web-clients) (dashPanel) and/or a [home automation binding](#home-automation-bindings).

### Choose your install

- **Docker (easiest)** — one compose file, `docker compose up -d`. Jump to [Docker Compose](#docker-compose-controller--optional-dashpanel-ui).
- **From source (for developers / tinkerers / bleeding-edge users)** — follow [Prerequisites](#prerequisites) below. Recommended if you want to pull fixes as they land on `master`.

### Prerequisites
If you don't know anything about Node.js, these directions might be helpful.

1. Install Node.js (v20+ required). (https://nodejs.org/en/download/)
1. Update npm (https://docs.npmjs.com/getting-started/installing-node).
1. Cloning the source is recommended — updates are frequently pushed while releases are infrequent.
   Clone with `git clone https://github.com/tagyoureit/nodejs-poolController.git`
   (Alternate — not recommended — download the latest [release](https://github.com/tagyoureit/nodejs-poolController/releases).)
1. Change directory into `nodejs-poolController`.
1. Run `npm install` in the new folder (where `package.json` exists). This installs all dependencies (serial-port, express, socket.io, etc).
1. Run the app with `npm start`.
   * `npm start` compiles the TypeScript code. Use this every time you download/clone/pull the latest.
   * `npm run start:cached` runs the app without compiling the code — much faster once built.
1. Install a [web client](#web-clients) for a browser experience and/or a [binding](#home-automation-bindings) for two-way control from Home Automation systems.

For a thorough walk-through, see the excellent [TroubleFreePool IntelliCenter guide](https://www.troublefreepool.com/threads/pentair-intellicenter-pool-control-dashboard-instructional-guide.218514/). Thanks @MyAZPool.

### Upgrade Instructions
Assuming you cloned the repo, the following are easy steps to get the latest version:
1. Change directory to the njsPC app
2. **Important**: Ensure you have Node.js v20 or higher installed (`node --version`). If not, upgrade Node.js first.
3. `git pull`
4. **Important**: Run `npm i` to update dependencies. This is especially important when upgrading to version 8.3.0+ (including 8.4.x and 9.0.0+) as it requires Node 20+ and has updated dependencies.
5. Start application as normal, or if using `npm run start:cached` then run `npm run build` to compile the code.

### Docker instructions

See the [wiki](https://github.com/tagyoureit/nodejs-poolController/wiki/Docker). Thanks @wurmr @andylippitt @emes.

#### Image channels (important)

The project has multiple image channels. `latest` only means latest within that specific channel.

* `ghcr.io/tagyoureit/njspc` - official controller image published from this repository's GitHub Actions (tracks upstream `master`).
* `msmi/nodejs-poolcontroller` - legacy Docker Hub controller image (can lag upstream).
* `ghcr.io/rstrouse/njspc-dash` - dashPanel image currently published separately.

### Docker Compose (Controller + Optional dashPanel UI)

Below is an example `docker-compose.yml` snippet showing this controller (`njspc`) and an OPTIONAL dashPanel UI service (`njspc-dash`). The dashPanel image is published separately; uncomment if you want a built-in web dashboard on port 5150.

```yaml
services:
   njspc:
      image: ${NJSPC_IMAGE:-ghcr.io/tagyoureit/njspc}
      container_name: njspc
      restart: unless-stopped
      environment:
         - TZ=${TZ:-UTC}
         - NODE_ENV=production
         # Serial vs network connection options
         # - POOL_NET_CONNECT=true
         # - POOL_NET_HOST=raspberrypi
         # - POOL_NET_PORT=9801
         # Provide coordinates so sunrise/sunset (heliotrope) works immediately - change as needed
         - POOL_LATITUDE=28.5383
         - POOL_LONGITUDE=-81.3792
      ports:
         - "4200:4200"
      devices:
         - /dev/ttyACM0:/dev/ttyUSB0
      # Persistence (create host directories/files first)
      volumes:
         - ./server-config.json:/app/config.json   # Persisted config file on host
         - njspc-data:/app/data                    # State & equipment snapshots
         - njspc-backups:/app/backups              # Backup archives
         - njspc-logs:/app/logs                    # Logs
         - njspc-bindings:/app/web/bindings/custom # Custom bindings
      # OPTIONAL: If you get permission errors accessing /dev/tty*, prefer adding the container user to the host dialout/uucp group;
      # only as a last resort temporarily uncomment the two lines below to run privileged/root (less secure).
      # privileged: true
      # user: "0:0"

   njspc-dash:
     image: ${NJSPC_DASH_IMAGE:-ghcr.io/rstrouse/njspc-dash}
     container_name: njspc-dash
     restart: unless-stopped
     depends_on:
       - njspc
     environment:
       - TZ=${TZ:-UTC}
       - NODE_ENV=production
       - POOL_WEB_SERVICES_IP=njspc      # Link to backend service name
     ports:
       - "5150:5150"
     volumes:
       - ./dash-config.json:/app/config.json
       - njspc-dash-data:/app/data
       - njspc-dash-logs:/app/logs
       - njspc-dash-uploads:/app/uploads

volumes:
  njspc-data:
  njspc-backups:
  njspc-logs:
  njspc-bindings:
  njspc-dash-data:
  njspc-dash-logs:
  njspc-dash-uploads:
```

Quick start:
1. Save compose file.
2. (Optional) create an empty config file: `touch dash-config.json`.
3. `docker compose up -d`
4. Visit Dash UI at: `http://localhost:5150`.

Notes:
* Provide either RS-485 device OR enable network (ScreenLogic) connection.
* `latest` is channel-specific; use image labels to verify exact code revision:
  * `docker image inspect ghcr.io/tagyoureit/njspc:latest --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'`
  * `docker image inspect msmi/nodejs-poolcontroller:latest --format '{{ index .Config.Labels "git-commit" }}'`
* Coordinates env vars prevent heliotrope warnings before the panel reports location.
* Persistence (controller):
   * `./server-config.json:/app/config.json` main runtime config. You can either:
      * Seed it with a copy of `defaultConfig.json` (`cp defaultConfig.json server-config.json`), OR
      * Start with an empty file and the app will auto-populate it from defaults on first launch. If the file exists but contains invalid JSON it will be backed up to `config.corrupt-<timestamp>.json` and regenerated.
   * Remaining state (data, backups, logs, custom bindings) is typically stored in named volumes in the provided compose for cleaner host directories. If you prefer bind mounts instead, replace the named volumes with host paths similar to the example below.
   * Data artifacts: `poolConfig.json`, `poolState.json` etc. live under `/app/data` (volume `njspc-data`).
   * Backups: `/app/backups` (volume `njspc-backups`).
   * Logs: `/app/logs` (volume `njspc-logs`).
   * Custom bindings: `/app/web/bindings/custom` (volume `njspc-bindings`).
* To migrate from bind mounts to named volumes, stop the stack, `docker run --rm -v oldPath:/from -v newVolume:/to alpine sh -c 'cp -a /from/. /to/'` for each path, then update compose.

### Automate startup of app
See the [wiki](https://github.com/tagyoureit/nodejs-poolController/wiki/Automatically-start-at-boot---PM2-&-Systemd).

## Ecosystem

njsPC is the server at the center of a small ecosystem. To do anything useful with it, you'll pair it with at least one of these:

| Project | Role |
|---|---|
| **njsPC** (this repo) | Server that talks to your pool controller over RS-485 / ScreenLogic and exposes REST + WebSocket APIs. |
| [**dashPanel**](https://github.com/rstrouse/nodejs-poolController-dashPanel) | Recommended web UI. Works with IntelliCenter, \*Touch, and REM. |
| [**REM** (Relay Equipment Manager)](https://github.com/rstrouse/relayEquipmentManager) | Companion app for direct GPIO / i²c / SPI hardware — Atlas Scientific pH/ORP/EC/hum/prs/pmp/rtd probes, ADS1x15 A/D converters, pressure transducers, flow sensors, 10k/NTC temperature sensors. |

<a name="module_nodejs-poolController--clients"></a>

### Web Clients
- [**dashPanel**](https://github.com/rstrouse/nodejs-poolController-dashPanel) — full compatibility with IntelliCenter, \*Touch, and REM. The recommended client.

<a name="module_nodejs-poolController--bindings"></a>

## Home Automation Bindings

**Recommended integrations**

- [**Homebridge / HomeKit / Siri / EVE**](https://github.com/gadget-monk/homebridge-poolcontroller) — Apple Home support via Homebridge (by @gadget-monk, adopted from @leftyflip). Control your pool from Siri, iOS Home, and Apple Watch.
- [**MQTT**](https://github.com/crsherman/nodejs-poolController-mqtt) — the universal bridge. Works out-of-the-box with **Home Assistant**, Node-RED, openHAB, and anything else that speaks MQTT. Original release by @crsherman, rewrite by @kkzonie, testing by @baudfather and others. [Setup directions](https://github.com/tagyoureit/nodejs-poolController/wiki/Bindings-Integrations#mqtt).
  - [**Homeseer** via MQTT](https://github.com/tagyoureit/nodejs-poolController/wiki/Homeseer-Setup-Instructions) — integration directions by @miamijerry.
- [**Hubitat**](https://github.com/bsileo/hubitat_poolcontroller) — native driver by @bsileo (with prior help from @johnny2678, @donkarnag, @arrmo). [Setup directions](https://github.com/tagyoureit/nodejs-poolController/wiki/Bindings-Integrations#smartthingshubitat).
- [**InfluxDB**](https://github.com/tagyoureit/nodejs-poolController/wiki/Bindings-Integrations#influx) — push pool telemetry into Grafana dashboards.

**Community & legacy**

- [**Vera**](https://github.com/rstrouse/nodejs-poolController-veraPlugin) — plugin for the Vera hub. [Setup directions](https://github.com/tagyoureit/nodejs-poolController/wiki/Bindings-Integrations#vera).
- [Another SmartThings Controller](https://github.com/dhop90/pentair-pool-controller/blob/master/README.md) by @dhop90 — older, community-maintained.
- [ISY](src/integrations/socketISY.js) — original credit to @blueman2, enhancements by @mayermd.
- [ISY Polyglot NodeServer](https://github.com/brianmtreese/nodejs-pool-controller-polyglotv2) — by @brianmtreese.

## Support & Community

- **Discussions, recommendations, designs, clarifications** — [GitHub Discussions](https://github.com/tagyoureit/nodejs-poolController/discussions) is the primary place. Questions are welcome.
- **Tips, tricks, and deeper docs** — the [wiki](https://github.com/tagyoureit/nodejs-poolController/wiki).
- **Bug reports** — [open a GitHub issue](https://github.com/tagyoureit/nodejs-poolController/issues/new). For IntelliCenter or \*Touch bugs, a [replay capture](https://github.com/tagyoureit/nodejs-poolController/wiki/How-to-capture-all-packets-for-issue-resolution) is gold — it's usually how fixes get made.

## How you can help

njsPC is a volunteer project. You don't need to write code to make a difference:

- **File a good bug report** — with a [replay capture](https://github.com/tagyoureit/nodejs-poolController/wiki/How-to-capture-all-packets-for-issue-resolution) attached. This is the #1 way non-coders unblock fixes for their own equipment.
- **Answer a question** in [Discussions](https://github.com/tagyoureit/nodejs-poolController/discussions).
- **Improve the wiki** with setup notes, quirks, or photos of adapters / wiring that worked for you.
- **Submit a PR** — pumps, heaters, lights, and home-automation bindings have all come from community contributors (see [Credits](#credits)).

## Changelog

Full release history — [Changelog](https://github.com/tagyoureit/nodejs-poolController/blob/master/Changelog).

<a name="module_nodejs-poolController--config.json"></a>

## Config.json reference

<details>
<summary>Expand for detailed <code>config.json</code> field reference (controller / web / log). Most of these can be set from dashPanel — you rarely need to edit this file by hand.</summary>

### Controller section - changes to the communications for the app
Most of these can be configured directly from the UI in dashPanel.
* `rs485Port` - set to the name of your RS-485 controller.  See [wiki](https://github.com/tagyoureit/nodejs-poolController/wiki/RS-485-Adapter-Details) for details and testing.
* `portSettings` - should not need to be changed for RS485
* `mockPort` - opens a "fake" port for this app to communicate on.  Can be used with [packet captures/replays](https://github.com/tagyoureit/nodejs-poolController/wiki/How-to-capture-all-packets-for-issue-resolution).
* `netConnect` - used to connect via [Socat](https://github.com/tagyoureit/nodejs-poolController/wiki/Socat)
  * `netHost` and `netPort` - host and port for Socat connection.
* `inactivityRetry` - # of seconds the app should wait before trying to reopen the port after no communications.  If your equipment isn't on all the time or you are running a virtual controller you may want to dramatically increase the timeout so you don't get console warnings.
* `txDelays` - (optional) fine‑grained transmit pacing controls added in 8.1+ to better coexist with busy or bridged (socat / multiple panel / dual chlorinator) RS‑485 buses.  These values are all in milliseconds.  If the block is omitted, internal defaults are used (see `defaultConfig.json`).  All values can be hot‑reloaded from config.
   * `idleBeforeTxMs` – Minimum quiet time on the bus (no RX or TX seen) before a new outbound frame may start.  Helps avoid collisions just after another device finishes talking.  Typical: 40‑80.  Set to 0 to disable.
   * `interFrameDelayMs` – Delay inserted between completed outbound attempts (success, retry scheduling, or queue drain) and evaluation of the next outbound message.  Replaces the previous fixed 100ms.  Typical: 30‑75.  Lower values increase throughput but may raise collision / rewind counts.
   * `interByteDelayMs` – Optional per‑byte pacing inside a single frame.  Normally 0 (disabled).  Set to 1‑2ms only if you observe hardware or USB adapter overruns, or are experimenting with very marginal wiring / long cable runs.

Example tuning block - more conservative pacing for SunTouch that works way better than defaults:

```json
"txDelays": {
   "idleBeforeTxMs": 60,
   "interFrameDelayMs": 50,
   "interByteDelayMs": 1
}
```

Tuning guidance:
- Start with the defaults. Only change one value at a time and observe stats (collisions, retries, rewinds) via rs485PortStats.
- If you see frequent outbound retries or receive rewinds, first raise `idleBeforeTxMs` in small steps (e.g. +10ms) before touching `interFrameDelayMs`.
- If overall throughput feels sluggish but collisions are low, you may lower `interFrameDelayMs` gradually.
- Use `interByteDelayMs` only as a last resort; it elongates every frame and reduces total bus capacity.
- Setting any value too high will simply slow configuration bursts (e.g. on startup); setting them too low can cause more retries and ultimately lower effective throughput.

All three parameters are safe to adjust without restarting; edits to `config.json` are picked up by the existing config watcher.

### Web section - controls various aspects of external communications
* `servers` - setting for different servers/services
 * `http2` - not used currently
 * `http` - primary server used for api connections without secure communications
    * `enabled` - self-explanatory
    * `ip` - The IP of the network address to listen on.  Default of `127.0.0.1` will only listen on the local loopback (localhost) adapter.  `0.0.0.0` will listen on all network interfaces.  Any other address will listen exclusively on that interface.
    * `port` - Port to listen on.  Default is `4200`.
    * `httpsRedirect` - Redirect http traffic to https
    * `authentication` - Enable basic username/password authentication.  (Not implemented yet.)
    * `authFile` - Location of the encrypted password file.  By default, `/users.htpasswd`. If you have `authentication=1` then create the file users.htpasswd in the root of the application.  Use a tool such as http://www.htaccesstools.com/htpasswd-generator/ and paste your user(s) into this file.  You will now be prompted for authentication.
 * `https` - See http options above.
    * `sslKeyFile` - Location of key file
    * `sslCertFile` - Location of certificate file
 * `mdns` - Not currently used.
 * `ssdp` - Enable for automatic configuration by the webClient and other platforms.


### Log - Different aspects of logging to the application
 * `app` - Application wide settings
    * `enabled` - Enable/disable logging for the entire application
    * `level` - Different levels of logging from least to most: 'error', 'warn', 'info', 'verbose', 'debug', 'silly'
* `packet` - Configuration for the packet logger.

</details>

<a name="credits"></a>

## Credits

1. **@Rstrouse** — made the 6.0 rewrite and IntelliCenter support possible, continues to drive the project forward with monumental changes, and taught me a lot about coding along the way.
1. **@jwtaylor310** — provided a ton of IntelliCenter v3.004+ replay captures that tracked down and fixed bugs.
1. [**Jason Young**](http://www.sdyoung.com/home/decoding-the-pentair-easytouch-rs-485-protocol) — foundational protocol decoding (read both posts).
1. **Michael Russe** ([ceesco](https://github.com/ceesco53/pentair_examples) / [CocoonTech](http://cocoontech.com/forums/topic/13548-intelliflow-pump-rs485-protocol/?p=159671)) — detailed protocol writeup, also [on Pastebin](http://pastebin.com/uiAmvNjG).
1. [**Michael Usner**](https://github.com/michaelusner/Home-Device-Controller) — first JavaScript implementation building on the above.
1. [**rflemming**](https://github.com/rflemming) — first external contributor to the codebase.
1. **@arrmo** and **@blueman2** — early and ongoing help on Gitter.
1. **@celestinjr** — Regal (Century) Modbus pump support ([PR #1169](https://github.com/tagyoureit/nodejs-poolController/pull/1169)).
1. All the community members across GitHub Discussions, Issues, and TroubleFreePool who've filed captures, tested builds, and kept pools running.

## License

[GNU AGPL v3.0](https://www.gnu.org/licenses/agpl-3.0) — see [LICENSE](LICENSE).
Copyright © 2016–2026 Russell Goldin ([@tagyoureit](https://github.com/tagyoureit)) &lt;russ.goldin@gmail.com&gt;
