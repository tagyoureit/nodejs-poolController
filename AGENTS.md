# AGENTS.md - Lessons Learned & Guidelines

**Purpose:** Document patterns, corrections, and lessons learned during development to improve future interactions.

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
   - `INTELLICENTER-V3-INDEX.md` - Main implementation guide
   - `V3_COMPLETE_SUMMARY.md` - Complete protocol reference
   - `V3_ACTION_REGISTRY.md` - Action code reference
   
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

**Last Updated:** December 10, 2025  
**Source:** nodejs-poolController IntelliCenter v3.004 compatibility work

