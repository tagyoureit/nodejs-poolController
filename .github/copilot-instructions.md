# Copilot Project Instructions

Purpose: Help AI agents contribute effectively to nodejs-poolController (njsPC) with minimal ramp-up.

## 1. Core Domain & Architecture
- Goal: Bridge Pentair / compatible pool automation equipment (RS-485 / ScreenLogic) to REST, WebSockets, MQTT, InfluxDB, Rules, and REM (Relay Equipment Manager) interfaces.
- Startup sequence (see `app.ts`): config.init -> logger.init -> sys.init -> state.init -> webApp.init -> conn.initAsync (RS485 / network) -> sys.start -> webApp.initAutoBackup -> sl.openAsync (ScreenLogic).
- Major layers:
  1. `config/Config.ts`: Loads/merges `defaultConfig.json` + `config.json`, watches disk, applies env overrides (POOL_*). Always mutate via `config.setSection()` / `config.updateAsync()`.
  2. `controller/`:
     - `comms/Comms.ts` (RS485 transport) + `comms/messages/*` (protocol encode/decode) feeding message objects to system/state.
     - `Equipment.ts` (`sys`): Aggregates boards, pumps, heaters, bodies, chemistry, schedules.
     - `boards/*Board.ts` selected by `BoardFactory.fromControllerType()` (ControllerType enum) to encapsulate model-specific logic.
     - `State.ts`: Higher-level computed/state cache (emits events to interfaces & persistence).
  3. `web/Server.ts`: Orchestrates multiple server/interface types (http/https/http2, mdns, ssdp, mqtt, influx, rule, rem). Each concrete server extends a ProtoServer pattern (see file) and exposes `emitToClients` / `emitToChannel`.
  4. `logger/Logger.ts`: Winston wrapper with packet & ScreenLogic capture, optional replay capture mode (`log.app.captureForReplay`).
- Data Flow: Raw bytes -> `Comms` -> `Messages` decode -> equipment/state mutation -> events -> `webApp.emitToChannel()` -> clients (dashPanel, bindings, MQTT, etc.).

## 2. Key Conventions & Patterns
- Prefer calling exported singletons (`config`, `logger`, `sys`, `state`, `webApp`, `conn`) — they are initialized once in `app.ts`.
- Extend support for a new controller board: create `controller/boards/NewBoard.ts` implementing expected interface and add to `BoardFactory` switch.
- Adding an external interface: implement a server class similar to existing ones in `web/Server.ts` and register in `initInterfaces()` via `type` value in `web.interfaces` section of config.
- Configuration writes are async & debounced by a semaphore (`_isLoading`). Avoid rapid consecutive writes — batch changes before `setSection`.
- Logging packets: push through `logger.packet(msg)`; only log when `log.packet.enabled` or capture mode active. Don't bypass logger for protocol-level diagnostics.
- Use `utils.uuid()` for persistent IDs stored back into config (`web.servers.*` / `web.interfaces.*`).

## 3. Build & Run Workflow
- Scripts (`package.json`): `npm start` = build (tsc) + run `dist/app.js`; `npm run start:cached` skips build (use only after prior successful build); `npm run build` or `watch` for development.
- Always rebuild after pulling if Typescript sources changed (common; master is live development).
- Minimum Node >=16 (see `engines`).
- Typical dev loop: edit TS -> `npm run build` (or `watch` in one terminal) -> `npm run start:cached` in another.

## 4. Safe Change Guidelines (Project Specific)
- Never directly edit `config.json` structure assumptions without updating `defaultConfig.json` and migration logic if needed.
- When adding message types: place in proper `controller/comms/messages/{config|status}` folder; ensure decode populates strongly typed object consumed by equipment/state.
- Emitting to clients: prefer channel scoping with `webApp.emitToChannel(channel, evt, payload)` over broad `emitToClients` to reduce noise.
- Shutdown paths must await: see `stopAsync()` ordering in `app.ts`; replicate that order if introducing new long-lived resources.
- Packet capture integration: if adding new traffic sources, feed capture arrays so `logger.stopCaptureForReplayAsync()` includes them in backups.

## 5. Extending / Examples
- Add new board: create file, implement constructor(system), override protocol handlers, add case in `BoardFactory`.
- Add new interface type: define class (e.g., `FooInterfaceServer`) patterned after `MqttInterfaceServer`; map `type: 'foo'` in config to new class in `initInterfaces` switch.
- Add env override: update `Config.getEnvVariables()` with POOL_* variable mapping.

## 6. Debugging Tips
- Packet issues: enable `log.packet.logToConsole` & set `log.app.level` to `debug` or `silly` in `config.json` (or via capture mode) then rebuild & restart.
- Config reload: editing `config.json` on disk triggers fs watch; logger reinitializes log settings automatically.
- Network discovery problems: inspect `mdns` / `ssdp` sections in `web.servers` config; ensure correct interface binding (`ip` / `0.0.0.0`).

## 7. Common Pitfalls
- Forgetting to rebuild after TS edits (leads to running stale `dist`).
- Mutating returned config objects directly after `getSection` (they are deep-cloned; you must re-set via `setSection`).
- Adding interface without persisting UUID: ensure `utils.uuid()` assigned when undefined.
- Logging floods: avoid tight loops writing directly to console; use logger buffering (`packet` flush timer) pattern.

## 8. Contribution Checklist (Agent Focused)
1. Identify layer (comms / equipment / state / interface / config / logging) impacted.
2. Update or add unit-like logic in correct module; keep cross-layer boundaries (no UI assumptions in lower layers).
3. Use existing singletons; avoid new global state without need.
4. Validate build (`npm run build`) before proposing changes.
5. Provide brief rationale in PR tying change to equipment behavior or integration capability.

Feedback welcome: clarify any unclear pattern or request examples to extend this guide.
