# IntelliCenter v3 Config Triage Summary

## Initial issues reported

- General -> Personal Information:
  - City/State/Zip not syncing between dashPanel and WCP/OCP.
  - Pool Alias/Owner/Zip values overwriting each other.
  - Latitude blank in dashPanel; longitude not editable/syncing.
- General -> Timezone & Locality:
  - Switching Internet/12h <-> Manual/24h caused bogus Pool/Spa setpoints and heat mode in dashPanel.
- General -> Delays:
  - Delays not linking correctly.
  - Missing v3 fields: Frz Cycle Time (min) and Frz Override (min).
  - Manual Operation Priority in dashPanel does not clearly map to WCP.
- Sensor Calibration:
  - Generally working; occasional +/-1 variance (likely timing/read cadence).
- Alerts/Security:
  - Tabs empty.
- Loading stuck at 0%:
  - Intermittent post-change loading hang (notably replay 157).

## What is fixed

- v3 Action 168 body temp/settings parsing hardened:
  - Added handling for payload variants so Pool/Spa setpoint/heat-mode values are parsed correctly.
- Latitude/Longitude outbound mapping corrected:
  - Fixed wrong latitude assignment target.
  - Corrected byte math/order for lat/lon packet payload.
  - Normalized coordinate assignment precision.
- General config refresh reliability improved:
  - Forced v3 refresh path to include general category refresh to reduce stale General-tab data.
- Country field inbound parse width increased:
  - Expanded from 16 to 32 bytes to avoid truncation/misalignment.

## What is not fully fixed yet

- Personal Information end-to-end mapping:
  - Alias/Owner/City/State/Zip still need definitive byte-level inbound/outbound confirmation.
- Delays v3 fields:
  - Frz Cycle Time (min) and Frz Override (min) offsets not yet identified.
  - Manual Operation Priority mapping still unconfirmed.
- Alerts/Security mapping:
  - Need packet-level evidence to confirm source actions/offsets and parser wiring.
- Loading stuck:
  - Root cause identified as RS-485 comm instability + frequent v3 refresh retriggers under noisy conditions; mitigation implementation still pending.

## Root cause of loading stuck

- In replay 157, poolState ends with:
  - status.name = "loading"
  - percent = 0
- Same run shows elevated comm issues:
  - unrecoverable collisions
  - invalid packets
  - outbound retries
  - repeated config refresh triggers (ACK(168), ACK(184), piggyback)
- Net effect:
  - refresh cycles are retriggered/churned during unstable traffic and can fail to settle cleanly.

## Information needed to finish remaining work

- Capture one setting change at a time (with timestamp notes), then wait a few seconds before next change.

### Personal Information

- Pool Alias
- Owner
- City
- State
- Zip
- Latitude
- Longitude

### Time/Locality

- 12/24-hour switch
- Internet/manual clock source
- DST toggle
- Time zone change

### Delays (especially v3-specific)

- Frz Cycle Time (min)
- Frz Override (min)
- Any setting suspected to map to Manual Operation Priority

### Alerts/Security

- Toggle each available option individually (if present on WCP/OCP)

### Packet evidence needed for each run

- Action 30 (config responses)
- Action 168 (external/config broadcasts)
- Related request/ack flow (Action 222, Action 1, piggyback trigger context)

## Current status

- DONE: High-confidence parsing and lat/lon write-path fixes applied.
- PENDING: Remaining fields require targeted packet captures for accurate mapping.
- PENDING: Loading-hang mitigation implementation.
