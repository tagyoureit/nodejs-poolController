# Fork tracking — intarweb/nodejs-poolController (image: ghcr.io/intarweb/njspc)

**HEAD-tracked Model B** fork of [`tagyoureit/nodejs-poolController`](https://github.com/tagyoureit/nodejs-poolController). We rebase onto upstream `master` daily and carry patches on `intarweb-dev` until they merge upstream. Image name `njspc` overrides repo name `nodejs-poolController` (matching upstream's `ghcr.io/tagyoureit/njspc`). See the `ghcr-fork-mirror` skill.

## Branch model

- **`master`**       — byte-identical to `upstream/master`. The sync workflow rebases this daily.
- **`intarweb-dev`** — `master` + cherry-picked open PRs we have filed upstream. The build-from-source workflow promotes `:latest` only from this branch.
- **Tags** (`9.0.0`, `9.0`, `8.4.1`, `8.4`, `8`) — explicit version pins, byte-identical mirror of upstream's tagged images via `imagetools cp`. NOT auto-promoted to `:latest`.

## Why this fork is HEAD-tracked (currently carrying TWO patches)

### Patch 1 — EquipmentStateMessage IntelliCenter-v3 detection re-narrow

Upstream commit `fb67a2d0` (PR #1171) broadened the IntelliCenter v3 detection in `controller/comms/messages/status/EquipmentStateMessage.ts` to match `model1 === 3` alone (previously `model2 === 2 && model1 === 3`). Author rationale: "no IntelliTouch variant has ever reported model1=3" — only checked IntelliTouch.

EasyTouch2 4P (and likely other EasyTouch variants) also reports `model1 === 3` with `model2 !== 2`, falling into the over-broad IntelliCenter trap. Symptom: post-fb67a2d builds set `controllerType = 'intellicenter'`, fail expansion-module discovery, leave `equipment.model = 'Unknown'`, and no circuits/schedules/pumps populate. Pool equipment never runs.

Hardware-in-the-loop bisect (5 SHA-tagged image tests, 2026-06-06) on EasyTouch2 4P + Intelliflo VSF + IC40 chlorinator confirmed `fb67a2d0` is the regression point.

Patch re-adds the `model2 === 2` precondition to the `model1 === 3` clause. Single-file change.

### Patch 2 — IntelliChem standalone-listen mode on EasyTouch + IntelliCenter

IntelliChem broadcasts state messages (action 18 from address 144-158) on the RS-485 bus regardless of OCP-mediated routing. njspc has had a `intellichemStandalone` passive-listen mode for a while, but it was hard-gated behind `controllerType === Nixie`. EasyTouch and IntelliCenter installations could only receive IntelliChem state if the OCP knew about the IntelliChem at the panel-config level.

Real failure mode: after EasyTouch firmware updates that wipe peripheral configs, the panel may no longer know about its IntelliChem, but the IntelliChem is still wired and broadcasting. njspc with `chemController.type = intellichem` then accepts the IntelliChem-routed-to-OCP path internally (no `rewinding message collision` errors) but never gets state because the OCP isn't forwarding.

Patch removes the Nixie-only gate so the user can opt into standalone listen mode on any board via `PUT /config/chemController { intellichemStandalone: true }`. The `IntelliChemStateMessage` parser is already wired into the bus dispatcher (`Messages.ts` line 1139 for `Protocol.IntelliChem`); only the config gate was wrong.

Files changed: `EasyTouchBoard.ts`, `IntelliCenterBoard.ts`, `SystemBoard.ts`, `web/services/config/Config.ts`.

## Workflows

| File | Purpose | Trigger |
|---|---|---|
| `.github/workflows/sync-upstream.yml` | rebase `master` onto upstream/master, regen `intarweb-dev` from open PRs | every 30 min + manual |
| `.github/workflows/build-from-source.yml` | build Dockerfile, push `:sha-XXXXXXX` (always) + promote `:latest` (intarweb-dev only) | push to master/intarweb-dev + manual |
| `.github/workflows/fork-publish.yml` | byte-identical mirror of upstream's tagged GHCR images | hourly + manual |

| Property | Value |
|---|---|
| Image | `ghcr.io/intarweb/njspc` |
| `:latest` source | from-source build of `intarweb-dev` (master + open intarweb PRs) |
| `:sha-XXXXXXX` source | from-source build of master OR intarweb-dev push HEAD |
| `:9.0.0` / `:9.0` / `:8.4.1` / `:8.4` / `:8` | byte-identical mirror of upstream's same-named tags |

## How to consume

```yaml
# docker-stacks (home) — current target
njspc:
  image: ghcr.io/intarweb/njspc:latest   # from-source build of upstream master + intarweb's two patches
```

Or pin to a specific build:
```yaml
  image: ghcr.io/intarweb/njspc:sha-XXXXXXX
```

Or pin to a pre-regression upstream release if you don't want our patches:
```yaml
  image: ghcr.io/intarweb/njspc:9.0.0    # last known-good before fb67a2d0
```

## Maintenance recipes

**Force a fresh sync run:**
```bash
gh workflow run "Sync from upstream + auto-regen intarweb-dev" --repo intarweb/nodejs-poolController
```

**Force a from-source rebuild:**
```bash
gh workflow run "Build from source → GHCR" --repo intarweb/nodejs-poolController --ref intarweb-dev
```

**Once an upstream PR merges:** the carried commits drop out of `intarweb-dev` automatically (the sync workflow's tree-diff catches "no unique commits" once the PR's content is on master). When BOTH PRs merge upstream, this fork can revert to mirror-only.

The image-name override (`njspc` ≠ repo `nodejs-poolController`) follows the same pattern as our `docker-autoheal` → `autoheal` fork.
