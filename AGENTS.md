# AGENTS.md - Lessons Learned & Guidelines

**Purpose:** Document patterns, corrections, and lessons learned during development to improve future interactions.

## ⚠️ FIRST: Check .plan/ Directory

**Before debugging protocol/packet issues:**
1. Read `.plan/INDEX.md` - Master index for protocol documentation (links to controller-specific indexes)
2. Check equipment-specific protocol files (e.g., `.plan/201-intellicenter-circuits-features.md`, `.plan/202-intellicenter-bodies-temps.md`)
3. Review `.plan/203-intellicenter-action-registry.md` for action code meanings

**Protocol documentation is in `.plan/`, NOT in this file.** This file contains coding patterns and lessons learned.

---

## Architecture Patterns (CRITICAL)

### 0. State Access Pattern: Use Accessors, Not Raw JSON
**Rule:** Do NOT set/get nested state JSON objects directly unless the accessor is explicitly designed to work with an object.
- Most state fields are **persisted as JSON**, but the public API should be **scalar getters/setters** (number/string/boolean) that:
  - normalize persisted shapes
  - apply transforms/valueMaps
  - manage `hasChanged` / `state.dirty` correctly
- Only use object-level access when there is an **explicit object accessor** whose contract is “you pass an object” (and it manages diffing/emits).

**Examples**
- **Scalar (preferred)**:
  - Set: `state.status = 0`
  - Get: `if (state.status === 0) { /* ... */ }`
- **Explicit object accessor (allowed)**:
  - Set: `state.temps.bodies.getItemById(1).heaterOptions = { total: 2, gas: 1, heatpump: 1 }`
  - Get: `const opts = state.temps.bodies.getItemById(1).heaterOptions`

### 1. Message Processing Location
**Rule:** NO direct message processing logic in `Messages.ts`
- `Messages.ts` is a ROUTER only
- Delegate to appropriate message files:
  - Status messages → `EquipmentStateMessage.ts`
  - Config messages → `ConfigMessage.ts`, `ExternalMessage.ts`, etc.
  
**Violated in this chat:**
- Action 217 handler with logic directly in Messages.ts (lines 792-810)
- Should be in `EquipmentStateMessage.ts` or similar

**Correction:** ✅ FIXED - Action 217 now delegated to EquipmentStateMessage.ts

### 2. State Persistence
**Rule:** NO local class variables for cross-session state
- Ephemeral state (current session only) → Local variables OK
- Persistent state (survives restarts) → Must use:
  - `poolConfig.json` (configuration data)
  - `poolState.json` (runtime state)
  - With appropriate Equipment/State class methods

**Violated in this chat:**
- `_hasRegistered` and `_registrationConfirmed` as class variables
- These need to survive restarts if OCP remembers registration

**Correction:** ✅ FIXED - Now using `state.equipment.registration` in poolState.json

### 3. Equipment State vs Top-Level State
**Rule:** Equipment-related state belongs in `EquipmentState`, not top-level `State`
- Follow existing pattern: properties like `controllerType`, `model`, `maxCircuits` are in `EquipmentState`
- Equipment-related state → `state.equipment.propertyName`
- Top-level state is for collections (pumps, circuits, etc.) or system-wide state (temps, heliotrope)

**Violated in this chat:**
- Initially added `registration` property to top-level `State` class
- Should be in `EquipmentState` since it's controller registration state

**Correction:** ✅ FIXED - Moved to `state.equipment.registration` with getter/setter in EquipmentState

### 4. Protocol Values vs Invented States
**Rule:** Only use values that come from the actual protocol
- Don't invent intermediate states that aren't in the protocol
- State should reflect what OCP reports, not our internal workflow
- Example: Action 217 byte[2] has values 0, 1, 4 - don't add status=5 for "requested"

**Violated in this chat:**
- Initially added status=5 for "requested" state
- This value doesn't exist in the protocol, only 0/1/4 come from OCP

**Correction:** ✅ FIXED - Removed status=5, only track OCP's response (0/1/4)

### 5. Addressing Confusion
**Rule:** Always verify address mappings before implementing
- 15 = Broadcast
- 16 = OCP
- Got this backwards initially, causing confusion

**Lesson:** When dealing with protocol constants, explicitly verify from working examples first

### 6. Board Access Pattern (CRITICAL)
**Rule:** Never “rebind” / “re-initialize” the singleton board instance to a local variable (e.g., `const board = sys.board as IntelliCenterBoard`)
- Boards are initialized once at app startup
- Access the board via `sys.board` directly
- Persistent config/state should be accessed via `sys` (poolConfig.json) and `state` (poolState.json), not via cached board references

**Violated in this chat:**
- `EquipmentStateMessage.ts` used `const board = sys.board as IntelliCenterBoard` inside message handling

**Correction:** ✅ FIXED - Use `sys.board` directly without local rebinding

### 7. Controller-Specific Overrides (CRITICAL): SystemBoard.ts must be controller-agnostic
**Rule:** Do NOT add controller-specific branching (e.g., `if (sys.controllerType === ControllerType.IntelliCenter) ...`, `if (sys.equipment.isIntellicenterV3) ...`) inside shared base command classes in `controller/boards/SystemBoard.ts`.

- **Why:** The default `byteValueMaps` in `SystemBoard.ts` include generic/*Touch-style defaults (e.g., `heatModes`) which are **wrong for IntelliCenter v3.004+**.
- **Correct pattern:** Each controller board overrides the relevant command object (e.g., `IntelliCenterBoard` uses `IntelliCenterHeaterCommands extends HeaterCommands`) and implements controller-accurate behavior there.
- **Call-site rule:** Always call `sys.board.heaters.updateHeaterServices()` (or the appropriate `sys.board.<domain>` command), and rely on polymorphism to dispatch to the controller-specific implementation.

**Bug example (dashPanel heat mode labels):**
- `/config/options/heaters` returns `sys.board.valueMaps.heatModes.toArray()`
- If IntelliCenter-specific heater service mapping isn’t used, the UI can map numeric heatMode values to the wrong names (e.g., mapping `5` to “Solar Only” instead of “UltraTemp Only” on IC v3).

**Fix pattern:**
- Put IntelliCenter mapping in `IntelliCenterHeaterCommands.updateHeaterServices()` (already present in `controller/boards/IntelliCenterBoard.ts`)
- Keep `HeaterCommands.updateHeaterServices()` in `SystemBoard.ts` generic for non-IntelliCenter controllers

**Same pattern for body picklists:**
- Keep `BodyCommands.getHeatSources()` / `getHeatModes()` in `SystemBoard.ts` generic.
- Any IntelliCenter v3-specific filtering (e.g., suppressing `solarpref` / `ultratemppref` options for body-level mode picklists) must live in `IntelliCenterBodyCommands` in `controller/boards/IntelliCenterBoard.ts`.

**Generalization:** This applies to *anything* that is overridden by controller boards (IntelliCenter, EasyTouch, IntelliTouch, AquaLink, SunTouch, Nixie, etc.).  
If you find yourself writing `if (sys.controllerType === ...)` inside `SystemBoard.ts`, that is almost always a design smell—create/extend the controller-specific command class in the appropriate board file and keep `SystemBoard.ts` purely generic.

## Analysis Patterns

### 6. Examine Working State, Not Just Failures
**Rule:** When debugging, look for WORKING periods in captures
- User insight: "Packet #576 shows byte[2]=1 (REGISTERED)"
- This means njsPC WAS working at that point
- Should analyze: What changed between #576 (working) and #999 (failed)?
- Should check: Are config requests working between #576 and #999?

**Violated in this chat:**
- Focused on failure at packet #999
- Didn't analyze the working period from #576 to #999
- Missed opportunity to see if config WAS loading successfully

**Correction needed:** Analyze packets #576-#999 to see if config requests worked

### 7. Source of Truth Identification
**Rule:** Identify authoritative data sources in protocol
- User insight: "Action 217 is the source of truth"
- Should have recognized this earlier from captures

**Lesson:** When multiple messages contain similar data, identify which is authoritative

### 8. Temperature Debugging: Use Time-Series Sources, Not `poolState.json`
**Rule:** When debugging temperature-driven behavior (solar/heater thresholds), do NOT rely on `poolState.json` for trends.
- `poolState.json` represents the **last/current** state snapshot, not a time series.
- To understand when thresholds were crossed, extract temps from **packet logs** (and/or other raw-sample logs that capture temps over time).
- Use the time-series to correlate: **AIR/WATER/SOLAR temps** ↔ **heater/valve commands** ↔ **triggering events**.

## Communication Patterns

### 8. Documentation Organization
**Rule:** ONE markdown file per topic in `.plan/` directory
- Before creating new `.plan/*.md` file, check if topic already covered
- Update existing file rather than creating duplicate
- If splitting needed, cross-reference between files
- Periodically review and delete outdated/superseded files
- **When completing work:** Update the EXISTING plan file with status, don't create new "_COMPLETE" files

**Violated in this chat (Dec 10, 2025):**
- Created `V3_ARCHITECTURE_FIX_COMPLETE.md` immediately after establishing "one file per topic" rule
- Should have updated existing `V3_REGISTRATION_FIX_PLAN.md` instead
- User feedback: "stop creating new .md files in .plan. Consolidate with the latest known info. follow the new rules in agent.md"

**Correction:** ✅ FIXED - Deleted duplicate file, updated existing plan file with completion status

**Hierarchy:**
1. **Master docs** (keep these):
   - `200-intellicenter-v3-index.md` - Main implementation guide
   - `204-intellicenter-v3-protocol.md` - Complete protocol reference / findings summary
   - `203-intellicenter-action-registry.md` - Action code reference
   
2. **Active work** (current tasks):
   - `V3_REGISTRATION_FIX_PLAN.md` - Current work plan
   
3. **Key insights** (important discoveries):
   - `V3_ACTION_217_DISCOVERY.md` - Action 217 as source of truth
   
4. **Reference** (technical analysis):
   - `ACTION_204_V1_VS_V3_ANALYSIS.md` - Module detection

**Delete:** Temporary files, superseded analysis, old troubleshooting

### 9. Meta-Rule: Ask About Documentation
**Rule:** When user provides correction or clarification, ASK:
> "Should I add this to AGENTS.md for future reference?"

This creates a feedback loop for continuous improvement.

### 10. Validate Assumptions Before Implementation
**Rule:** When making architectural changes, state assumptions and ask for validation
- Example: "I'm planning to use local variables for this. Is that appropriate?"
- Don't assume patterns - verify first

### 10.1 UI Error Attribution (dashPanel)
**Rule:** Treat dashPanel errors as **UI-initiated command failures only**.
- dashPanel only shows errors for actions a user initiates from dashPanel (e.g., a “turn on/off” click).
- It will NOT surface retries/timeouts from njsPC background flows (config polling, heartbeats, etc.).
- Therefore: absence of dashPanel errors is **not evidence** that the underlying protocol traffic is healthy; always confirm via packet logs and njsPC logs.

### 10.2 IntelliCenter v3 Source-of-Truth: Do NOT Process Wireless→OCP Requests
**Rule:** For IntelliCenter v3 (v3.004+), the **OCP (addr 16)** is the **only source of truth** for state/config changes.

- **Do not process** packets that are **Wireless/ICP/Indoor → OCP** (e.g. src=36 dest=16) as if they were authoritative.
  - These are **requests**; the OCP may ACK or ignore them, and the final state can differ.
- Only update state/config from **OCP-originated** messages (source=16), and preferably from the established authoritative message types:
  - Config/state broadcasts/responses (e.g., Action 30 / Action 204 / other status broadcasts)
  - NOT from third-party device requests

**Implementation note:** In `Messages.ts`, gate IntelliCenter Action 168 handling to ignore non-OCP sources (especially src!=16 dest==16).

### 11. Modifying Existing Rules
**Rule:** Never modify, remove, or contradict existing rules in AGENTS.md without explicit user approval
- When a situation arises that conflicts with an existing rule, STOP and ask the user
- Present: "Existing rule X says Y, but I think Z. Which should I follow?"
- Let user decide whether to update the rule, create an exception, or follow existing rule
- Document the resolution in AGENTS.md

**Rationale:** Rules in AGENTS.md represent learned patterns from user feedback. Changing them without approval risks losing important context.

## Protocol Discovery Patterns

### 12. Hardware Protocol Work Requires User Collaboration
**Rule:** Don't guess protocol behavior - ask user to test
- We can't test with actual hardware
- User has the hardware and can capture real behavior
- Iterate based on real captures, not assumptions

**This chat did well:** Multiple capture iterations with user feedback

### 13. Incremental Understanding
**Rule:** Protocol understanding evolves through captures
- Initial understanding: "Action 179 is proactive heartbeat" ✗
- Corrected: "Action 179 is request/response from OCP" ✓
- User observation: "Wireless sends Action 180 to OCP, not broadcast"

**Lesson:** Be ready to revise understanding as new evidence emerges

## Current Issues to Address

### Issue 1: Action 217 Handler Location ✅ RESOLVED
- **Problem:** Logic in Messages.ts
- **Solution:** Moved to EquipmentStateMessage.ts
- **Status:** Complete

### Issue 2: Registration State Storage ✅ RESOLVED
- **Problem:** Using local class variables
- **Solution:** Stored in poolState.json via state.equipment.registration
- **Status:** Complete

### Issue 3: Duplicate Registration Flags ✅ RESOLVED
- **Problem:** Two flags when one suffices
- **Solution:** Single state.equipment.registration status (values: 0/1/4) exposed via accessor (persisted JSON is internal)
- **Status:** Complete

### Issue 4: Registration Status != Config Working (CRITICAL)
- **Problem:** byte[2]=1 (registered) doesn't mean config is loading
- **Evidence:** Packets #576-#999 showed byte[2]=1, heartbeat working, but ZERO Action 30 responses
- **Analysis:** 
  - OCP acknowledged njsPC (Action 179/180 heartbeat working)
  - njsPC sent 462 Action 222 config requests
  - OCP responded to NONE of them
  - Registration alone is not sufficient for config loading
- **Question:** What else is required beyond registration?
- **Priority:** CRITICAL (blocks entire feature)

## Questions for Future

1. What triggers config responses beyond registration?
2. Why does byte[2]=1 not enable config loading?
3. Is there a timing window after registration?
4. Does OCP need fresh registration each session (not remember from previous)?

---

## Quick Reference for Debugging

### 14. Always Check .plan/ First
**Rule:** Before debugging IntelliCenter v3 issues, read:
- `.plan/INDEX.md` - Protocol documentation index (then IntelliCenter: `.plan/200-intellicenter-v3-index.md`)
- `.plan/203-intellicenter-action-registry.md` - Action code meanings
- `.plan/204-intellicenter-v3-protocol.md` - Protocol findings summary

### 14.1 Packet Header DEST/SRC Order (CRITICAL)
**Rule:** The packet header is:
`[165, 1, DEST, SRC, ACTION, LEN]`

**Do NOT grep/read this backwards.** DEST comes before SRC in the header, for every packet.

**Examples:**
- **Wireless → OCP command**: `DEST=16`, `SRC=36` → header starts with **`[165, 1, 16, 36, ...]`**
- **OCP → Wireless ACK**: `DEST=36`, `SRC=16` → header starts with **`[165, 1, 36, 16, ...]`**

### 15. Message Flow Architecture
**Packet → Messages.ts (router) → Handler Files:**

```
┌─────────────────┐
│  RS-485 Packet  │
└────────┬────────┘
         ▼
┌─────────────────┐
│  Messages.ts    │  ← ROUTER ONLY, no business logic!
│  (by action #)  │
└────────┬────────┘
         ▼
┌─────────────────────────────────────────────────────────┐
│ Action 2/204  → EquipmentStateMessage.ts (status)       │
│ Action 30     → ConfigMessage.ts → category handlers    │
│ Action 168    → ExternalMessage.ts (wireless changes)   │
│ Action 184    → EquipmentStateMessage.ts (v3 circuits)  │
│ Action 217    → EquipmentStateMessage.ts (device list)  │
│ Action 251/253→ Registration handshake                  │
│ Chlorinator   → ChlorinatorStateMessage.ts              │
│ Pump protocol → PumpStateMessage.ts                     │
└─────────────────────────────────────────────────────────┘
```

**Config Handlers (Action 30, routed by payload byte[0]):**

| Category | Handler | Purpose |
|----------|---------|---------|
| 0 | OptionsMessage | System options |
| 1 | CircuitMessage | Circuit config |
| 2 | FeatureMessage | Feature config |
| 3 | ScheduleMessage | Schedule times/days |
| 4 | PumpMessage | Pump config |
| 5 | RemoteMessage | Remote buttons |
| 6 | CircuitGroupMessage | Light/circuit groups |
| 7 | ChlorinatorMessage | Chlorinator settings |
| 8 | IntellichemMessage | Chemistry controller |
| 9 | ValveMessage | Valve assignments |
| 10 | HeaterMessage | Heater config |
| 11 | SecurityMessage | PIN codes |
| 12 | GeneralMessage | Pool name, location |
| 13 | EquipmentMessage | Body/equipment config |
| 14 | CoverMessage | Pool covers |

**External Message Handlers (Action 168, routed by payload byte[0]):**

| Case | Handler Method | Purpose |
|------|----------------|---------|
| 0 | processTempSettings | Setpoints/heat mode |
| 1 | processCircuit | Circuit changes |
| 2 | processFeature | Feature changes |
| 3 | processSchedules | Schedule changes |
| 4 | processPump | Pump changes |
| 7 | processChlorinator | Chlorinator changes |
| 10 | processHeater | Heater changes |

### 16. v3.004 Development Baseline (CRITICAL)
**Rule:** All v3.004+ IntelliCenter changes started on **November 26, 2025**. Everything in the codebase before that date was working correctly for v1.x.

**Implications:**
- When investigating v3 issues, only look at commits from 11/26/2025 onwards
- Any code that existed before 11/26/2025 should be assumed correct for v1.x
- v3 changes MUST be gated behind `sys.equipment.isIntellicenterV3` to avoid breaking v1
- Do NOT modify pre-11/26 code paths without explicit approval

**Git command to see v3 changes:**
```bash
git log --oneline --since="2025-11-26" -- <file>
```

### 17. v3.004 Endianness Pattern (CRITICAL)
**Rule:** v3.004 uses BIG-ENDIAN for 16-bit time values; v1.x uses LITTLE-ENDIAN.

**Check:** Any `extractPayloadInt()` for schedule/time values needs v3 handling.

**Fix pattern:**
```typescript
if (sys.controllerType === ControllerType.IntelliCenter && sys.equipment.isIntellicenterV3) {
    time = msg.extractPayloadIntBE(offset);  // Big-endian for v3.004+
} else {
    time = msg.extractPayloadInt(offset);    // Little-endian for v1.x
}
```

**Already fixed:**
- `ScheduleMessage.processStartTimes()` - schedule start times
- `ScheduleMessage.processEndTimes()` - schedule end times  
- `ExternalMessage.processSchedules()` - wireless schedule changes

**Check for similar issues in:** Any message handler parsing 16-bit time values.

### 18. State Sync Pattern
**Rule:** When config properties are set, ALWAYS sync corresponding state properties.

**Bug pattern:** Config property set but state not synced → UI shows undefined/blank.

**Example (chlorinator name bug we fixed):**
```typescript
// BAD - name set in config but never synced to state
chlor.name = "Chlorinator 1";
// schlor.name never set → dashPanel shows blank name!

// GOOD - always sync config properties to state
chlor.name = "Chlorinator 1";
schlor.name = chlor.name;  // ← Don't forget this!
```

**Checklist when reviewing config handlers:**
1. Find all `chlor.property = value` assignments
2. Verify each has corresponding `schlor.property = chlor.property`
3. Check for default values when property might be undefined

### 19. Finding Configuration Data for Debugging
**Rule:** Feature/circuit names and IDs are in configuration files, not guesswork.

**Locations:**
- Live system: `./data/poolConfig.json` and `./data/poolState.json`
- Replay captures: `[replayname]/njspc/data/poolConfig.json` and `poolState.json`

**Key ID ranges (IntelliCenter):**
- Circuits: 1-40 (varies by system)
- Features: Start at 129 (`sys.board.equipmentIds.features.start`)
- Circuit Groups: Start at 192 (`sys.board.equipmentIds.circuitGroups.start`)

**Example lookup:**
```json
// From poolConfig.json
"features": [
  { "id": 129, "name": "Test_Feature" },
  { "id": 130, "name": "Air Blower222" },
  { "id": 131, "name": "TestF2" }
]
```

### 20. Packet Log Analysis
**Rule:** When analyzing packet captures, decode payloads systematically.

**CRITICAL: Always include packet IDs when discussing packets.** The `id` field in each packet log entry is essential for:
- Cross-referencing with user observations
- Correlating request/response pairs
- Debugging timing issues
- Reproducing specific scenarios

**Format for discussing packets:**
```
#2605 23:09:49 Action30/15 byte9=3 features: ['129', '130']  <-- CONFIG RESPONSE
#2607 23:09:52 Action204 byte19=2 features: ['130']         <-- OVERWRITES!
```
Always prefix with `#` and packet ID.

**Packet structure:** `[header][payload][checksum]`
- Header: `[165, 1, dest, src, action, length]`
- Action codes: See `.plan/203-intellicenter-action-registry.md`

**Common analysis steps:**
1. Filter by action code: `grep "action\":168"` for external messages
2. Decode payload bytes using handler code as reference
3. Check timestamps for sequence/timing issues
4. Look for request/response pairs (outbound `dir":"out"` → inbound `dir":"in"`)
5. **Always extract and display packet IDs** in any analysis output

**Decoding times (v3.004 big-endian):**
- Two bytes `[hi, lo]` → `hi * 256 + lo` = minutes since midnight
- Example: `[2, 33]` → `2*256 + 33 = 545` → 9:05 AM

### 21. v3.004+ Action 184 Circuit Control (CRITICAL)
**Rule:** v3.004+ uses Action 184 for circuit control, NOT Action 168.

**Problem:** When njsPC sends Action 168 to control circuits on v3.004+, OCP accepts it briefly then reverts the state. The Wireless remote uses Action 184, which OCP accepts permanently.

**Solution:** 
- Each circuit has a unique `targetId` (16-bit value stored in poolConfig.json)
- njsPC learns Target IDs from OCP Action 184 broadcasts
- When controlling circuits, njsPC sends Action 184 with the learned Target ID

**Action 184 Payload (10 bytes):**
```
[channelHi, channelLo, seq, format, targetHi, targetLo, state, 0, 0, 0]
 ├─ Channel: 104,143 (default) or circuit-specific (e.g., 108,225 for Pool)
 ├─ Target: Circuit's unique ID (e.g., 168,237 for Spa, 108,225 for Pool)
 └─ State: 0=OFF, 1=ON
```

**Known Target IDs (user's system):**
| Circuit | Target ID | Hex |
|---------|-----------|-----|
| Spa (circuit 1) | 168,237 | 0xA8ED |
| Pool (circuit 6) | 108,225 | 0x6CE1 |
| Body status | 212,182 | 0xD4B6 (not a circuit) |

**Learning strategies:**
1. **Channel=Target pattern**: When bytes 0-1 equal bytes 4-5, identifies circuit
2. **Unique state match**: When only one circuit matches broadcast state (ON/OFF)
3. **State correlation**: Schedule/automation triggers state change → learn mapping

**Unknowns (to investigate):**
- How Target IDs are assigned (hardware serial? config order?)
- Whether Target IDs can change (suspected: stable)
- Full decode of body status (212,182) payload

**Code locations:**
- `Circuit.targetId` property: `controller/Equipment.ts`
- Learn from broadcasts: `EquipmentStateMessage.ts` (case 184)
- Send commands: `IntelliCenterBoard.createAction184Message()`
- Circuit control: `IntelliCenterBoard.setCircuitStateAsync()`

### 22. v3.004+ Action 168 vs Action 30 Offset Difference (CRITICAL)
**Rule:** v3.004 Wireless Action 168 type 0 has DIFFERENT byte offsets than Action 30 type 0!

**Problem:** When parsing body setpoints/heat modes from Wireless remote messages (Action 168 type 0), using Action 30 offsets (19-24) produces garbage values.

**Root Cause:** The Wireless Action 168 payload has an extra byte in early positions, shifting all indices by +1.

**Correct Offsets:**
| Field | Action 30 | Action 168 |
|-------|-----------|------------|
| Pool setpoint | 19 | **20** |
| Pool cool | 20 | **21** |
| Spa setpoint | 21 | **22** |
| Spa cool | 22 | **23** |
| Pool mode | 23 | **24** |
| Spa mode | 24 | **25** |

**Code Location:** `ExternalMessage.ts` → `processTempSettings()` detects v3 and uses correct offsets.

**Verified from captures:** Replay 30 (5 packets), Replay 48 (multiple packets).

### 23. Protocol Documentation Structure

**Rule:** Detailed packet/flow documentation lives in `.plan/` directory, organized by controller type and equipment type.

**ALWAYS read `.plan/INDEX.md` first** when working on protocol issues. It indexes all protocol documentation (including IntelliCenter: `.plan/200-intellicenter-v3-index.md`).

#### Protocol Files by Controller Type

**IntelliCenter:**
- `.plan/201-intellicenter-circuits-features.md` - Circuits, features, groups (current)
- `.plan/203-intellicenter-action-registry.md` - Action code reference
- `.plan/204-intellicenter-v3-protocol.md` - Protocol findings summary
- `.plan/200-intellicenter-v3-index.md` - IntelliCenter v3.004 index (linked from `.plan/INDEX.md`)

**Active protocol files:**
- `201-intellicenter-circuits-features.md` - Circuits, features, groups
- `202-intellicenter-bodies-temps.md` - Body temps/setpoints/heat modes

**Future files (create as needed):**
- `INTELLICENTER_PUMPS_PROTOCOL.md` - Pump control/status
- `INTELLICENTER_HEATERS_PROTOCOL.md` - Heater control/status
- `INTELLICENTER_SCHEDULES_PROTOCOL.md` - Schedule management
- `INTELLICENTER_CHEMISTRY_PROTOCOL.md` - IntelliChem/chlorinator

**Other Controllers (create as needed):**
- `INTELLITOUCH_*.md` - IntelliTouch protocols
- `EASYTOUCH_*.md` - EasyTouch protocols
- `NIXIE_*.md` - Nixie/virtual protocols

#### File Organization

Each protocol file should include:
1. **Message Types Summary** - Table of all relevant actions
2. **Complete Flow Diagrams** - Step-by-step packet sequences
3. **Byte Offset Tables** - Where data lives in payloads
4. **Version Differences** - v1.x vs v3.004+ variations
5. **Handler Routing** - Which code files process each message
6. **Troubleshooting** - Common issues and solutions

#### Quick Reference: Circuits/Features (v3.004+)

**Authoritative source:** Action 30 case 15 (NOT Action 204!)

**Key v3.004+ bug:** Action 204 byte 19 contains STALE feature state. Must skip processing.

**See:** `.plan/201-intellicenter-circuits-features.md` for full details.

#### Quick Reference: Bodies/Setpoints (v3.004+)

**⚠️ CRITICAL: Action 168 Wireless has DIFFERENT offsets than Action 30!**

| Field | Action 30 (config) | Action 168 (Wireless) |
|-------|-------------------|----------------------|
| Pool setpoint | byte 19 | byte 20 |
| Pool cool | byte 20 | byte 21 |
| Spa setpoint | byte 21 | byte 22 |
| Spa cool | byte 22 | byte 23 |
| Pool mode | byte 23 | byte 24 |
| Spa mode | byte 24 | byte 25 |

**Root cause:** Wireless Action 168 payload has extra byte in early positions, shifting indices by +1.

**Heat mode valueMap fix:** Use `htypes.total > 1` to check for multi-heater setups (Solar+UltraTemp).

**See:** `.plan/202-intellicenter-bodies-temps.md` for full details.

---

**Last Updated:** December 16, 2025  
**Source:** nodejs-poolController IntelliCenter v3.004 compatibility work

