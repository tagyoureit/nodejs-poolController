# Fork tracking — intarweb/nodejs-poolController (image: ghcr.io/intarweb/njspc)

**Mirror-only** fork of [`tagyoureit/nodejs-poolController`](https://github.com/tagyoureit/nodejs-poolController). We mirror upstream's GHCR images into `ghcr.io/intarweb/njspc` (note: image name ≠ repo name, matching upstream's `ghcr.io/tagyoureit/njspc`) so home infra can **pin a known-good pre-regression digest** while the IntelliCenter parser issue gets investigated upstream. No build-from-source, no sync-upstream. See the `ghcr-fork-mirror` skill.

## Why this fork exists (the IntelliCenter parser regression)

**Symptom (verified 2026-06-04 in home fleet):** upstream's `:latest` image rejects every RS-485 frame from the IntelliCenter as "unprocessed". Equipment discovery stalls at "awaiting installed modules", `circuits=[]`, `schedules=[]`, no pumps fire — pool controller is functionally offline.

**Timing — important correction to the original triage:**
- Upstream's `:latest` and `master` were last re-published **2026-05-15T16:34** (matches commit `89614106 build(deps): add ws and @types/ws dependencies` from that date).
- WUD's "pull `:latest` on 2026-06-04T21:59:41" event in home logs was a *no-op* re-pull (same digest as May 15) — but it triggered a container restart, which is when the May-15 image actually started running on the home node and the regression became visible.
- So the bad code shipped 2026-05-15; symptoms surfaced in our fleet 2026-06-04 because the container hadn't restarted in the interim.

**Suspected commit range:** between release `9.0.0` (last known-good per ostrich-hub-style triage) and `9.1.0` / current `master`. Recent default-branch commits worth reviewing:

```
89614106  build(deps): add ws and @types/ws dependencies   (2026-05-15 — current master HEAD)
```

…plus everything between `9.0.0` and `89614106`. The change set added a `ws` dependency (websocket) — possibly related but more likely unrelated to RS-485 parsing. Real suspect is anything in `src/controller/comms/messages/` or `src/controller/boards/IntelliCenterBoard.ts` between those refs. Investigating that requires:
1. Reading the diff `git diff 9.0.0..9.1.0 -- src/controller/comms src/controller/boards`
2. Testing the fix against real IntelliCenter hardware (we have it, but reproducing the bug in CI is impractical).

**Filed PR upstream:** *not yet.* Without hardware-in-the-loop validation, posting a speculative parser fix risks worse breakage. Next-session pickup: someone with access to the real njsPC + IntelliCenter to step through `git bisect 9.0.0 9.1.0` and find the exact bad commit.

## What this fork DOES today

- Mirrors **pre-regression anchor tags only**: `9.0.0`, `9.0`, `8.4.1`, `8.4`, `8`.
- **Deliberately NOT mirroring** `:latest`, `:master`, `9.1`, `9.1.0` — those are the regression suspects.
- Hourly cron + manual dispatch.

| Property | Value |
|---|---|
| Image | `ghcr.io/intarweb/njspc` |
| Source | byte-identical `imagetools` copy of `ghcr.io/tagyoureit/njspc` |
| Tags | `9.0.0`, `9.0`, `8.4.1`, `8.4`, `8` — pre-regression anchors only |
| Workflow | [`.github/workflows/fork-publish.yml`](.github/workflows/fork-publish.yml) — hourly `1 * * * *` + `workflow_dispatch` |

## How to consume

```yaml
# docker-stacks (home)
njspc:
  image: ghcr.io/intarweb/njspc:9.0.0   # last known-good before the IntelliCenter parser regression
```

When a fixed upstream release lands and we've validated it on real hardware: add the new `X.Y.Z` to `TAGS` in `fork-publish.yml`, force-run, then bump the home consume tag.

## Maintenance recipes

**Force a fresh mirror run:**
```bash
gh workflow run "Fork-publish (mirror upstream → GHCR)" --repo intarweb/nodejs-poolController
```

**Add a newly-validated tag:** edit `TAGS` in `fork-publish.yml`, commit signed, push to `master`. Next run mirrors it.

**Investigation next-step (when hardware time permits):**
```bash
# locally, on a machine with the IntelliCenter wired up
git -C ~/Projects/intarweb-forks/nodejs-poolController bisect start
git bisect bad 9.1.0
git bisect good 9.0.0
# at each bisect step: docker build + run + observe whether RS-485 frames process
```

The image-name override (`njspc` ≠ repo `nodejs-poolController`) follows the same pattern as our `docker-autoheal` → `autoheal` fork.
