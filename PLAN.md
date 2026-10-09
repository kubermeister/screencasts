# kubermeister/screencasts: build plan

Handoff for Claude Code. Read this file completely before writing anything. It is the agreed
design (2026-10-08); where it is explicit, follow it, and where it is silent, ask. It says
**STOP** where a decision belongs to the maintainer.

## 0. Ground rules for the agent

- **Plan before code.** At the start of each phase, state in a few lines what you will do and which
  files you will create or change, then do it. Never start the next phase without saying so.
- **Do not modify the app repository** (`../kubermeister`) except where a phase says so (Phase 0
  cleanup and Phase 11). Read it freely.
- **Work on branches, open PRs with `gh pr create`, never merge.** The maintainer merges. Never
  commit on `main` (the initial commit of Phase 1 is the one exception, see there).
- **Commit messages:** Conventional Commits, `type(scope): subject`, lowercase imperative subject,
  header ≤ 72 characters, **no trailers** (no `Co-Authored-By`, no `Signed-off-by`). Scopes for this
  repository: `repo` `ci` `deps` `docs` `cli` `harness` `voice` `render` `features` `brand`.
- **Comments explain why, not what.** Never `any` in TypeScript.
- After every change: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test`.
- Secrets (API keys) come from the environment only. Never write a key to a file in the repository.

## 1. What this repository is

`kubermeister/screencasts` turns committed text files into promo videos of Kubermeister features:

- **Input, committed:** per feature, `script.yml` (the beats, the text shown on screen, the
  voiceover text and voice settings) and `scene.ts` (Playwright automation that drives the app
  through those beats).
- **Output, never committed:** a 16:9 video, a 9:16 reel and WebVTT captions per feature, written
  to `out/` (git-ignored) on the maintainer's Mac.

Principles, all binding:

1. **Local only.** Videos are generated on the maintainer's machine. CI never records or renders.
2. **No manual editing.** Nobody opens a video editor. Cut, text, voice, captions, vertical crop and
   encoding all come from the committed files and one command.
3. **No automatic feature extraction.** Nothing reads releases or the changelog to decide what gets
   a video. Features are added by hand (or by an agent following the app's `AGENTS.md` rule).
4. **Reproducible.** Any video can be regenerated from the repository plus the app checkout at the
   matching version. A re-render looks the same to the eye (not bit-identical).
5. **Text carries the story.** Voiceover is optional per feature; its text is committed either way.
6. **One feature at a time is the normal use.** `--all` exists for redesigns.

## 2. Environment

- macOS (Apple silicon, Retina), Docker Desktop running, Node 24 (`.nvmrc`: `24`), npm ≥ 11.19,
  `helm` on `PATH` (optional: without it the Helm screens have no release), `ffmpeg` on `PATH`.
- The app is checked out next to this repository:

  ```
  ~/Projects/Kubermeister/
    kubermeister/      # the app (github.com/kubermeister/kubermeister)
    screencasts/       # this repository
  ```

  The app path is `../kubermeister` unless `KUBERMEISTER_APP` is set to an absolute path.

- Whatever the app checkout is on (a branch, `main`, a tag) is what gets filmed. The app must be
  built (`npm run build` in the app writes `out/`).

## 3. What screencasts uses from the app, and how

Read in place, never copied, never modified:

| What                  | Path in the app                                                                                                  | Used for                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Built app             | `out/main/index.mjs` (and the rest of `out/`)                                                                    | What Electron launches                              |
| Electron binary       | `node_modules/electron` (its default export is the binary path)                                                  | `executablePath` for the launch                     |
| Demo seed             | `tests/demo/fixtures/seed.yaml`, `seed-custom.yaml`                                                              | Seeding the demo cluster                            |
| Demo Helm chart       | `tests/demo/fixtures/chart/`                                                                                     | `helm install` + `helm upgrade`                     |
| App version           | `package.json` → `version`                                                                                       | Checking a script's `since`                         |
| Reference (read only) | `tests/demo/harness/{cluster,launch,history}.ts`, `tests/demo/shots/screenshots.test.ts`, `tests/demo/README.md` | The patterns this harness copies; working selectors |

**Why screencasts copies the harness code instead of importing it:** importing TypeScript across
repositories would load two Playwright installations into one process. The copied code is small:
cluster boot, app launch, chart history. Each copied file starts with a comment naming the app file
it follows.

## 4. Repository layout (target)

```
screencasts/
  README.md                  # how to run; mirrors sections 2, 7, 8 of this plan
  PLAN.md                    # this file, kept up to date as phases complete
  AGENTS.md                  # conventions from section 0, for future agents
  .nvmrc                     # 24
  .gitignore                 # node_modules/, out/, .cache/, *.log, .DS_Store
  .prettierrc.json           # same settings as the app's
  .editorconfig              # same as the app's
  eslint.config.mjs
  tsconfig.json              # strict
  package.json
  package-lock.json
  bin/
    video.ts                 # CLI entry: `npm run video -- …`
    new.ts                   # CLI entry: `npm run new -- <id>`
  schema/
    script.schema.json       # JSON Schema (draft 2020-12) for script.yml
  src/
    config.ts                # paths, app location, constants (window size, fps, colours ref)
    script.ts                # load + validate script.yml, typed
    state.ts                 # out/<id>/state.json: cache keys, what is up to date
    harness/
      app.ts                 # locate app, check build, launch Electron
      cluster.ts             # demo k3s cluster (Testcontainers), seeded from the app's fixtures
      history.ts             # chart history injected into main (copied pattern)
      director.ts            # scene API: beat, anchor, glide, click, type, hold, goto
      cursor.ts              # drawn cursor + click ring injected into the renderer
      recorder.ts            # CDP screencast → frames → footage.mp4 + timeline.json
      scene.ts               # defineScene() and the scene types
    voice/
      provider.ts            # VoiceProvider interface
      kokoro.ts              # local, default
      openai.ts              # gpt-4o-mini-tts
      elevenlabs.ts          # REST API
      cache.ts               # out/voice/<sha256>.wav + duration
    render/
      index.ts               # drives Remotion: bundle once, render each format
      captions.ts            # timeline + script → .vtt
    remotion/
      Root.tsx               # registers compositions Video (16:9) and Reel (9:16)
      Video.tsx
      Reel.tsx
      components/            # Title, Caption, Callout, EndCard, Cursorless footage, Zoom
      timing.ts              # beat → frame maths shared by both compositions
  brand/
    brand.json               # colours, fonts, sizes, safe zones, durations
    fonts/                   # font files (licensed for embedding; see Phase 6)
    logo.svg
  features/
    <feature-id>/
      script.yml
      scene.ts
  overview/                  # same shape as a feature (Phase 10)
  hero/                      # same shape as a feature (Phase 10)
  test/
    script.test.ts           # every script.yml validates; ids match folders; anchors declared
    scenes.test.ts           # every scene marks exactly the beats its script declares
    timing.test.ts           # beat/frame maths, VTT output
    cache.test.ts            # cache keys
  .github/workflows/ci.yml   # lint, typecheck, format, unit tests. No Docker, no rendering.
  out/                       # git-ignored, generated
  .cache/                    # git-ignored: kubeconfig, cluster state, Remotion bundle
```

## 5. `script.yml` (our own schema)

There is no industry standard for this. The schema lives in `schema/script.schema.json` and is the
single source of truth; `src/script.ts` validates with it (use `ajv`) and derives its TypeScript
types by hand to match (a unit test checks they agree on a sample).

```yaml
# features/text-size/script.yml
id: text-size # must equal the folder name
title: Text size # human title, used in the end card and logs
since: 0.10.0 # app version that shipped it (semver, no leading v)
formats: [video, reel] # any non-empty subset; default both
theme: dark # dark | light; default dark
voice: # optional; absent = no voiceover
  provider: kokoro # kokoro | openai | elevenlabs
  voice: af_heart # provider-specific voice id
  model: null # provider model; required for openai (gpt-4o-mini-tts) and elevenlabs
  instructions: null # openai only: delivery style, e.g. "calm, confident developer demo"
  speed: 1.0 # 0.8–1.2
beats:
  - id: intro
    text: { kind: title, value: 'Make Kubermeister easier to read' }
    say: 'Kubermeister 0.10 lets you choose how big the text is.'
  - id: open-picker
    text: { kind: caption, value: 'Settings › Appearance › Text size' }
  - id: larger
    text:
      kind: callout
      value: 'All text scales. Spacing and icons stay put.'
      anchor: text-size-picker
      side: auto # auto | above | below | left | right
    hold: 2s
  - id: outro
    text: { kind: end-card, value: 'Kubermeister 0.10.0 · kubermeister.dev' }
```

Rules the schema and `src/script.ts` enforce:

- `id`: `^[a-z0-9]+(-[a-z0-9]+)*$`, equals the folder name.
- `since`: semver `X.Y.Z`.
- `beats`: 1–20 items; `beats[].id` same pattern as `id`, unique within the script.
- `text` is optional per beat (a beat can be pure action). `kind` is one of `title`, `caption`,
  `callout`, `end-card`. `value` length: title ≤ 60, caption ≤ 80, callout ≤ 70, end-card ≤ 60
  characters, so text fits the reel without wrapping beyond two lines.
- `anchor` is required for `callout` and forbidden for the other kinds.
- At most one `title` (must be the first beat if present) and one `end-card` (must be the last).
- `hold`: duration `^\d+(\.\d+)?(ms|s)$`, default `1.2s` for beats with text, `0` without.
- `say`: optional, ≤ 300 characters. Used only when `voice` is set.
- Unknown keys are errors (`additionalProperties: false`).

**Beat semantics (the contract between scene, voice and render):**

- A beat **starts** when the scene calls `beat(id)`. Its text appears at the start.
- `beat(id)` resolves after `max(hold, voiceDuration(id) + 300ms)`; only then does the scene go on.
  So a spoken line always finishes before the next action.
- A beat's text stays on screen until the next beat with text starts, or for an `end-card`, until
  the end of the video.
- The video starts 500 ms before the first beat and ends 1.5 s after the last beat resolves.

## 6. `scene.ts`

```ts
// features/text-size/scene.ts
import { defineScene } from '../../src/harness/scene';

export default defineScene({
  // Before the video starts: not filmed.
  async setup({ goto, window }) {
    await goto('/settings/appearance');
    await window.getByRole('combobox', { name: 'Text size', exact: true }).waitFor();
  },
  // The video.
  async run({ window, beat, anchor, click, hold }) {
    const picker = window.getByRole('combobox', { name: 'Text size', exact: true });
    anchor('text-size-picker', picker);
    await beat('intro');
    await beat('open-picker');
    await click(picker);
    await click(window.getByRole('option', { name: 'Larger', exact: true }));
    await beat('larger');
    await click(picker);
    await click(window.getByRole('option', { name: 'Default', exact: true }));
    await beat('outro');
  },
  // After the video ends: not filmed. Back out of anything that would block closing.
  async cleanup() {},
});
```

Director API (`src/harness/director.ts`), all methods on the object passed to `setup`/`run`/`cleanup`:

| Method                  | Behaviour                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `window`                | The Playwright `Page` of the app window.                                                                                                                                              |
| `app`                   | The `ElectronApplication`.                                                                                                                                                            |
| `goto(path)`            | Sets `location.hash` to `#<path>` (the app uses hash routing), waits 400 ms.                                                                                                          |
| `beat(id)`              | Records the beat start in the timeline, then waits as in section 5. Throws on an id not in the script or a repeated id.                                                               |
| `anchor(name, locator)` | Registers an element; its box (CSS px) is recorded at the start of every beat and every 100 ms during a callout beat. Throws if the name is not used by any callout.                  |
| `glide(locator)`        | Moves the drawn cursor to the element's centre: ease-in-out, steps of 16 ms, step count `clamp(round(distance/18), 12, 45)`. Waits for visibility (60 s) and scrolls into view first. |
| `click(locator)`        | `glide`, wait 150 ms, mouse down/up, wait 250 ms.                                                                                                                                     |
| `type(text)`            | `keyboard.type` with 90 ms per key.                                                                                                                                                   |
| `press(keys)`           | `keyboard.press`, then 200 ms.                                                                                                                                                        |
| `hold(ms)`              | Waits.                                                                                                                                                                                |
| `kubectl(args)`         | Runs kubectl in the demo cluster (for setup, e.g. creating a second rollout).                                                                                                         |

At the end of `run`, the harness checks every beat in the script was marked, in order. A missing or
out-of-order beat fails the recording naming the beat.

## 7. CLI

```sh
npm run video -- <id>                        # record → voice → render, only what changed
npm run video -- <id> --format video|reel    # one format only
npm run video -- <id> --only record|voice|render
npm run video -- <id> --fresh                # ignore every cache
npm run video -- <id> --frames               # also write out/<id>/frames/NN-<beat>.png
npm run video -- <id> --open                 # open the outputs when done (macOS `open`)
npm run video -- <id> --theme light          # override the script's theme for this run
npm run video -- --all                       # every folder in features/, overview/, hero/
npm run new -- <id>                          # scaffold features/<id>/ from a template
npm run cluster -- up|down|status            # manage the demo cluster explicitly
```

Exit codes: 0 success, 1 failure (message names the feature and stage), 2 usage error.

Pre-flight checks before recording (each failure prints the exact fix):

1. The app directory exists and has `package.json` with `"name": "kubermeister"`.
2. `out/main/index.mjs` exists and is newer than every file under the app's `src/`; otherwise
   "Run `npm run build` in <app path>".
3. The app version ≥ the script's `since`; otherwise "This checkout of the app (vX) predates
   <id> (since vY). Check out a later version".
4. Docker is reachable; `ffmpeg` is on `PATH`.

**What reruns (default, without `--only`/`--fresh`):** `out/<id>/state.json` stores keys:

| Key        | sha256 of                                                                                                 | When it changes, redo                              |
| ---------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `app`      | the contents of the app's `out/` directory (sorted paths + bytes)                                         | record, render                                     |
| `scene`    | `scene.ts` + the beat ids and `hold`s + the voice durations + `theme` + harness source (`src/harness/**`) | record, render                                     |
| `voice[i]` | provider + model + voice + instructions + speed + the beat's `say`                                        | that line, then record (durations changed), render |
| `render`   | full `script.yml` + `brand/**` + `src/render/**` + `src/remotion/**` + the footage key                    | render                                             |

Voice is computed before the record decision, because durations feed the recording. If nothing
changed, print "<id> is up to date" and exit 0.

## 8. Outputs

```
out/
  voice/<sha256>.wav                 # shared voice cache, with <sha256>.json { durationMs }
  <id>/
    <id>-video.mp4                   # 1920×1080, 30 fps
    <id>-reel.mp4                    # 1080×1920, 30 fps
    <id>.vtt                         # WebVTT
    frames/NN-<beat>.png             # with --frames: the rendered video frame 300 ms into each beat
    footage.mp4                      # the raw recording (3200×1800, 30 fps, no cursor drawn by render)
    timeline.json                    # see Phase 3
    state.json                       # cache keys
```

Encoding for both formats: H.264 (`libx264`), `yuv420p`, 30 fps constant, CRF 18, `-movflags
+faststart`, AAC 160 kb/s when there is voice, no audio track otherwise, metadata stripped
(`-map_metadata -1`).

WebVTT: one cue per beat with text or `say`, from the beat start to the next beat start (last cue
to the end); cue text is `say` when present, otherwise the text value.

## 9. Phases

Each phase ends with a PR. Acceptance criteria must all hold before opening it.

### Phase 0: cleanup (two leftovers from the design discussion)

1. In the app checkout, delete the untracked folder `media/` (it holds only an outdated
   `DESIGN.md`). Confirm with `git -C ../kubermeister status --short` that nothing else is
   untracked or modified **before** deleting; if anything else is, **STOP** and ask.
2. Delete the folder `~/Projects/Kubermeister/media/`. It holds only an old draft `DESIGN.md` from
   when this repository was going to be called `media`; this repository replaces it.

No PR (nothing is committed).

### Phase 1: repository skeleton

- Create `~/Projects/Kubermeister/screencasts` and `git init` there; create the files of section 4 that are config
  (`.nvmrc`, `.gitignore`, `.prettierrc.json`, `.editorconfig`, `eslint.config.mjs`,
  `tsconfig.json`, `package.json`, `README.md`, `AGENTS.md`), copy this plan to `PLAN.md`.
  Copy `.prettierrc.json` and `.editorconfig` from the app verbatim.
- `package.json`: `"private": true`, `"type": "module"`, `engines` node ≥ 24 / npm ≥ 11.19, and
  `engine-strict` in `.npmrc`. Dependencies (exact versions, no `^`, latest stable at the time of
  writing, check each with `npm view <pkg> version`):
  - runtime: `playwright` (the library, not `@playwright/test`), `@testcontainers/k3s`, `yaml`,
    `ajv`, `semver`, `tsx`, `remotion`, `@remotion/bundler`, `@remotion/renderer`, `react`,
    `react-dom`, `kokoro-js`, `openai`.
  - dev: `typescript`, `eslint`, `typescript-eslint`, `@eslint/js`, `globals`, `prettier`,
    `vitest`, `@types/node`, `@types/react`.
  - All `@remotion/*` and `remotion` at the **same** version (Remotion requires it).
  - Playwright: at least the version of `@playwright/test` installed in the app; print a warning at
    startup if lower.
- Scripts: `video` → `tsx bin/video.ts`, `new` → `tsx bin/new.ts`, `cluster` → `tsx
bin/cluster.ts`, `lint`, `typecheck` (`tsc --noEmit`), `format`, `format:check`, `test`
  (`vitest run`).
- `.github/workflows/ci.yml`: on pull_request and push to main; one job: checkout, setup-node
  (`node-version-file: .nvmrc`, `check-latest: true`, `cache: npm`), `npm ci`, lint, typecheck,
  format:check, test. Pin actions by SHA, same SHAs the app uses:
  `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`,
  `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0`; `persist-credentials:
false` on checkout; top-level `permissions: contents: read`.
- Create the GitHub repository `kubermeister/screencasts` (public or private: **STOP** and ask), push the
  initial commit to `main` (`chore(repo): initial skeleton`). From here on, branches and PRs.

Acceptance: `npm ci && npm run lint && npm run typecheck && npm run format:check && npm test` pass
locally and in CI.

### Phase 2: harness — app, cluster, chart history

- `src/config.ts`: `APP_DIR` (env `KUBERMEISTER_APP` or `resolve('../kubermeister')`),
  `CACHE_DIR = .cache`, `OUT_DIR = out`, `WINDOW = { x: 40, y: 40, width: 1600, height: 900 }`
  (exact 16:9; Retina gives 3200×1800), `FPS = 30`.
- `src/harness/cluster.ts`: copy the app's `tests/demo/harness/cluster.ts` behaviour with these
  differences: container name `km-screencasts-cluster`, kubeconfig at `.cache/kubeconfig`, state at
  `.cache/cluster.json`, seed and chart paths resolved in `APP_DIR`. Keep: the k3s image constant
  (same value as the app's `K3S_IMAGE`; comment says to keep them equal), context name
  `orbit-production`, node name `orbit-node-01`, namespace `production`, add-ons left on, the two
  seed passes with the CRD wait, real `helm install` + `upgrade`, waits for the six healthy
  deployments, wait for metrics. Kept between runs by default; `KM_SCREENCASTS_FRESH=1` or
  `npm run cluster -- down` removes it.
- `src/harness/app.ts`:
  - Pre-flight checks 1–3 of section 7.
  - `launch({ theme })`: makes a temp user-data dir, writes `settings.json` exactly as the app's
    `tests/demo/harness/launch.ts` does (version 1, session pinned to the demo context and
    namespace, `connection.kubeconfigPath`, `updates: { mode: 'off', checkIntervalHours: 4 }`,
    `data: { refreshIntervalSec: 5, readTimeoutSec: 60, logBufferLines: 2000,
terminalFontSize: 13 }`, `window: { bounds: WINDOW }`, chart repository if Helm is present);
    launches with `_electron.launch({ executablePath: <APP_DIR>/node_modules/electron default
export>, args: [<APP_DIR>/out/main/index.mjs, '--disable-renderer-backgrounding',
'--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'], cwd:
APP_DIR, env: { ...process.env, KUBERMEISTER_USER_DATA, KUBECONFIG,
KUBERMEISTER_SHOW_INACTIVE: '1', TZ: 'UTC' } })`; waits for `getByTestId('app-shell')`
    (60 s); sets the theme by writing `localStorage['km-theme']` and reloading (as the app's
    `switchTheme`); returns `{ app, window, userData, close }`. `close` closes the app and removes
    the user-data dir.
  - If settings validation in the app rejects the file (the app falls back or errors), fail with
    "The app's settings schema changed; update src/harness/app.ts" and the app's message.
- `src/harness/history.ts`: copy the app's `tests/demo/harness/history.ts` (replaces the handlers
  of `metrics.sparklines`, `metrics.workloadHealth`, `metrics.nodeSeries` through `app.evaluate`
  and `ipcMain`), reading `kubectl top node` from the screencasts cluster.

Acceptance: `npm run cluster -- up` boots and seeds the cluster; a throwaway script launches the
app, shows the cluster summary with filled charts in both themes, closes cleanly. `npm run cluster
-- status` prints container id and readiness; `down` removes it.

### Phase 3: harness — director, cursor, recorder, timeline

- `src/harness/cursor.ts`: `injectCursor(window)` idempotently adds a fixed element
  `#km-screencasts-cursor` (`pointer-events: none`, max `z-index`) holding an SVG arrow (white fill, dark
  1.5 px stroke, drop shadow), following `mousemove` in the capture phase, and on `mousedown` a
  28 px ring that scales to 1.8× and fades over 400 ms. Re-inject after every reload/navigation.
  (Playwright's mouse leaves no system cursor in a recording; this is the only cursor.)
- `src/harness/recorder.ts`, CDP screencast:
  1. `session = await window.context().newCDPSession(window)`.
  2. `Page.startScreencast({ format: 'jpeg', quality: 92, maxWidth: 3200, maxHeight: 1800,
everyNthFrame: 1 })`.
  3. On each `Page.screencastFrame`: write `data` (base64 JPEG) to `.cache/frames/<id>/NNNNNN.jpg`
     with its `metadata.timestamp` (seconds since epoch, float) into an in-memory list; reply
     `Page.screencastFrameAck({ sessionId })` immediately.
  4. Stop with `Page.stopScreencast` after the scene's tail (section 5).
  5. Build `footage.mp4` with ffmpeg's concat demuxer: a list file with each frame and
     `duration` = next timestamp − this timestamp (last frame: until the end time), then
     `-vf fps=30,scale=3200:1800:flags=lanczos -c:v libx264 -crf 14 -pix_fmt yuv420p`. Frames
     only arrive on repaint; the durations fill the gaps, `fps=30` makes it constant.
  6. Delete the JPEGs after a successful encode.
- `timeline.json` (the contract between recording and rendering):

  ```json
  {
    "version": 1,
    "footage": { "file": "footage.mp4", "width": 3200, "height": 1800, "fps": 30, "durationMs": 14533 },
    "scale": 2,
    "startEpochMs": 1791460000000,
    "beats": [{ "id": "intro", "startMs": 500, "endMs": 3100 }],
    "anchors": { "text-size-picker": [{ "atMs": 3100, "box": { "x": 612, "y": 344, "w": 240, "h": 32 } }] },
    "cursor": [{ "atMs": 0, "x": 800, "y": 450, "down": false }]
  }
  ```

  All times relative to the first frame; boxes and cursor in CSS px (multiply by `scale` for
  footage px). `startEpochMs` is the first frame's timestamp. Cursor samples on every glide step
  and click.

- `src/harness/director.ts` and `src/harness/scene.ts`: the API of section 6. `beat()` uses voice
  durations from `out/voice/` (Phase 5 provides them; until then durations are 0).
- `bin/video.ts` stage `record`: ensure cluster → launch → inject chart history → set theme →
  inject cursor → `setup` → start recorder → wait 500 ms → `run` → wait 1.5 s → stop recorder →
  `cleanup` → close → write `footage.mp4` + `timeline.json`. Each scene gets its own launch.
- Port the `text-size` feature as the first scene (section 5 and 6 examples) with
  `formats: [video]` only for now.

Acceptance:

- `npm run video -- text-size --only record` writes `footage.mp4` (3200×1800, 30 fps) and
  `timeline.json` with all four beats and the anchor, in under 2 minutes on a warm cluster.
- The recording is correct while another app window fully covers Kubermeister (proves background
  rendering). If it is not, **STOP** and report what you saw; do not switch to screen capture
  without the maintainer.
- Missing `beat('larger')` in the scene fails with a message naming `larger`.

### Phase 4: schema, validation, scaffolding

- `schema/script.schema.json` with every rule of section 5; `src/script.ts` loads YAML (`yaml`),
  validates (`ajv`, `allErrors`), and adds the cross-field rules (title first, end-card last,
  anchor presence, unique ids, `id` = folder).
- `test/script.test.ts`: every `features/*/script.yml`, `overview/script.yml`,
  `hero/script.yml` validates; a set of invalid fixtures under `test/fixtures/` each fails with
  the expected message.
- `test/scenes.test.ts`: for each feature, the `beat('…')` calls found in `scene.ts` (static
  scan with a regex on string literals) equal the script's beat ids, same order; every
  `anchor('…')` name is used by a callout and vice versa.
- `bin/new.ts <id>`: refuses an existing folder; writes `script.yml` (title, `since` = the app's
  current version, an intro title beat, one caption beat, an end card) and `scene.ts` (the
  section 6 skeleton with a TODO in `setup` and `run`).
- Editors: add `# yaml-language-server: $schema=../../schema/script.schema.json` as the first
  line of every `script.yml` (the scaffold writes it).

Acceptance: CI runs these tests; a broken script fails CI with a readable message.

### Phase 5: voice

- `src/voice/provider.ts`: `interface VoiceProvider { id: string; synthesize(text: string,
settings: VoiceSettings): Promise<{ wav: Buffer; durationMs: number }> }`.
- `kokoro.ts` (default): `kokoro-js`, model `onnx-community/Kokoro-82M-v1.0-ONNX`, `dtype: 'q8'`,
  CPU; model files cached by the library on first use (say so in the log). Voice from
  `voice.voice` (e.g. `af_heart`), `speed` applied.
- `openai.ts`: `openai` SDK, `audio.speech.create({ model, voice, input, instructions,
response_format: 'wav' })`; key from `OPENAI_API_KEY`; missing key → error naming the variable.
- `elevenlabs.ts`: REST `POST /v1/text-to-speech/{voice}` with `model_id`, output PCM/WAV; key
  from `ELEVENLABS_API_KEY`.
- `cache.ts`: key = sha256 of `provider|model|voice|instructions|speed|text`; files
  `out/voice/<key>.wav` and `<key>.json` (`{ durationMs }`); duration measured with `ffprobe`.
- Stage `voice` in the CLI: synthesize every beat with `say` when `voice` is set; durations feed
  `beat()` (section 5) and the record key (section 7).
- Do not implement voice cloning.

Acceptance: adding `voice: { provider: kokoro, voice: af_heart }` and a `say` to `text-size`
produces one WAV, makes the `intro` beat last at least the line's length + 300 ms, and a second
run reuses the cache (no synthesis logged). OpenAI and ElevenLabs are covered by unit tests with
the HTTP layer mocked; real calls only when the maintainer runs them.

### Phase 6: render 16:9

- Brand (`brand/brand.json`): background, text, accent and callout colours taken from the app's
  dark and light design tokens (read `../kubermeister/src/renderer` CSS variables; list in the PR
  which token each colour came from). Font: the app's UI font if its license allows embedding in
  video; otherwise Inter (SIL OFL). **STOP** and ask if unsure.
- Remotion (`src/remotion/`): composition `Video`, 1920×1080, 30 fps, `durationInFrames` from the
  timeline. Footage scaled from 3200×1800 to 1920×1080 (`OffthreadVideo`).
  - `title`: centred over a 40 % dark scrim, fades in 250 ms, out 250 ms at its end.
  - `caption`: lower third, max 2 lines, 44 px, on a translucent panel.
  - `callout`: rounded label + arrow pointing to the anchor box (footage px → frame px), `side:
auto` picks the side with most room; follows the box samples, eased.
  - `end-card`: logo, `value` text, full frame, last 2.5 s (extends the composition).
  - Voice: each beat's WAV at its beat start (`<Audio>`), gain 1.0; no music.
- `src/render/index.ts`: bundle once per run (`@remotion/bundler`), `renderMedia` with codec
  `h264`, `crf: 18`, `pixelFormat: 'yuv420p'`, then the metadata strip of section 8 if Remotion's
  output carries metadata.
- `captions.ts`: WebVTT as section 8. `--frames`: `renderStill` at each beat start + 300 ms.

Acceptance: `npm run video -- text-size --frames` writes `text-size-video.mp4`, `text-size.vtt`
and four frames; each frame shows the beat's text where section 6 says; changing only a caption's
wording re-renders without re-recording (log shows record skipped) in under 60 s.

### Phase 7: render 9:16 reel

- Composition `Reel`, 1080×1920, 30 fps, layout **stacked**:
  - Top band (y 160–560): title or current caption, 60 px, max 3 lines.
  - Middle: the footage in a 1080-wide panel (16:9 → 1080×608), y 600–1208, with a **follow
    zoom**: by default the whole window; during a callout beat, zoom up to 1.8× centred on the
    anchor box; elsewhere zoom up to 1.4× following the cursor. Zoom and pan eased over 400 ms,
    never leaving the footage bounds.
  - Bottom band (y 1240–1600): the callout text (callouts become text here, with a small marker
    drawn on the anchor in the panel).
  - Keep y < 160 and y > 1600 free of text: platforms overlay their own UI there.
  - End card full frame.
- `formats: [video, reel]` for `text-size`.

Acceptance: `npm run video -- text-size --format reel --frames` writes `text-size-reel.mp4`;
frames show text only within the bands; the zoom lands on the Text size picker during `larger`.

### Phase 8: incremental reruns and polish of the CLI

- `state.ts` and the rerun table of section 7; `--fresh`, `--only`, `--format`, `--open`,
  `--theme`, `--all` (sequential, continues after a failure, summary at the end, exit 1 if any
  failed).
- Progress output: one line per stage with duration, e.g. `text-size  record  41.2s`.

Acceptance: a script with nothing changed prints "up to date" in under 5 s; each row of the
rerun table is demonstrated in the PR description.

### Phase 9: stability (determinism)

Goal: two consecutive `--fresh` renders of `text-size` look the same: same names, numbers, text
and timing within ±2 frames per beat.

1. Pinned environment (already from Phases 2–3): window, theme, `TZ=UTC`, update checks off.
2. Add a frame comparison: `npm run video -- <id> --compare` renders `--frames` and compares each
   with the previous run's frames (`pixelmatch`, threshold 0.1, report the % of differing pixels
   per beat; fail above 2 %).
3. Run it on `text-size` and two more scenes (Phase 10's first two). Report what differs and why
   (ages, generated pod names, log lines, chart values, animation timing).
4. **STOP** and present options to the maintainer before going further. Known options, cheapest
   first: (a) keep the cluster between runs so ages and names stay put (it is kept by default);
   (b) record request/response IPC answers once and replay them by replacing `ipcMain` handlers
   (the pattern `history.ts` uses), leaving watches and streams live; (c) inject CSS that disables
   transitions. Do not change the app repository for this.

### Phase 10: the first scenes, overview, hero

Write `script.yml` + `scene.ts` for each, selectors taken from the app's
`tests/demo/shots/screenshots.test.ts`:

| id                | What it shows                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `command-palette` | `Meta+k`, type "deploy", pick **Deployments**, the deployments list                                                                 |
| `workload-logs`   | Deployment `checkout` › **Logs**: interleaved lines from every pod, **Highlight matches**, filter `ERROR`                           |
| `rollout-compare` | **History** tab, **From revision** #1, **To revision** #2, the diff (setup restarts `checkout` if it has one revision)              |
| `manifest-review` | **Manifest** › **Edit**, change `replicas` to 5, **Review changes**, the diff; cleanup: **Keep editing** › **Cancel** › **Discard** |
| `node-drain-plan` | Node `orbit-node-01`, **Drain**, the plan; cleanup: Escape                                                                          |

Then `overview/` (60–90 s, 16:9 only, stitches the strongest beats of the features: write it as
its own scene, not by concatenating outputs) and `hero/` (16:9, silent, 20 s, no text, loops:
first and last frame must match closely; ends where it starts).

Acceptance: each renders with `--frames`; the maintainer reviews them.

### Phase 11: the rule in the app repository

Only after Phase 7 is merged. In `../kubermeister`, on a branch `docs/screencasts-rule`, add to
`AGENTS.md`, after the section "The documentation", this section (edit wording to the file's style,
keep the substance):

```markdown
### Promo videos

- Promo videos are generated from the `kubermeister/screencasts` repository, checked out next to this one.
  Videos are rendered locally only and never committed anywhere.
- **An important feature gets a video script in the pull request that ships it.** Important means a
  user would want it shown: a new screen, a new action, a visible change to a workflow. Not a fix, a
  small tweak, or a setting nobody would film.
- For such a feature, also open a pull request in `../screencasts` adding `features/<id>/` (run
  `npm run new -- <id>` there), with `script.yml` and `scene.ts` written from the code, the
  CHANGELOG line and the docs page. Render it (`npm run video -- <id> --frames`), check every beat's
  frame shows what its text says, and fix the scene until it does. Link the two pull requests.
- Test ids and labels a scene relies on are part of what a UI change must keep working; a change
  that breaks one updates the scene in `../screencasts` in the same piece of work.
```

Open the PR with `gh pr create`; title `docs(repo): add the promo video rule to the agent
instructions`. Never merge.

## 10. Decisions already made (do not reopen)

- Separate repository `kubermeister/screencasts`, sibling of the app checkout; the app only gains the
  `AGENTS.md` rule.
- Local-only rendering; outputs git-ignored; CI renders nothing.
- No manual editing; no automatic feature extraction; no release reminder issue.
- Capture: CDP screencast (not Playwright `recordVideo`, not macOS screen capture).
- Composition: Remotion, free license (the project is the maintainer's own; if it ever belongs to a
  company of more than three employees, a Remotion company license is needed).
- Voice: optional; Kokoro default, OpenAI `gpt-4o-mini-tts` and ElevenLabs behind the same
  interface; voice generated before recording; audio cached by content.
- `script.yml` is our own schema, validated by JSON Schema.
- Screenshots stay in the app repository, unchanged.

## 11. Open questions for the maintainer (the agent asks; never guesses)

1. Public or private GitHub repository (Phase 1).
2. Font licensing, if the app's font is not clearly embeddable (Phase 6).
3. Stability options after the Phase 9 report.

## 12. Status

| Phase | State | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | done  | `media/` removed from the app checkout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 1     | done  | TypeScript pinned to 6.0.x: typescript-eslint supports `<6.1`. `sharp` overridden to 0.35.5: 0.34 compiles from source when Homebrew's `vips` is installed. Unneeded install scripts denied in `allowScripts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2     | PR    | `window.bounds` is the outer frame, so `launch` also sets the content size to exactly 1600×900 from main. A `__name` no-op is defined in main and the renderer because tsx's keepNames breaks serialized `evaluate` callbacks. Chart history is injected inside `launch`, before the theme reload, so the first read already gets it.                                                                                                                                                                                                                                                                                                                                                   |
| 3     | PR    | Frames can arrive out of paint order, so the recorder sorts them by timestamp, and cuts the encode to the exact span with `-t` (the concat demuxer's repeated last entry adds a second of its own). Background rendering was proven by covering the window with an opaque always-on-top `BrowserWindow` from main: AppleScript control of other apps is not authorized in this terminal. `src/script.ts` holds the types and a minimal loader; Phase 4 adds validation.                                                                                                                                                                                                                 |
| 4     | PR    | Ajv runs strict except `strictRequired`, which rejects the if/then form of "a callout needs an anchor". Fixtures carry their expected message in a `# expect:` first line. Cross-field rules run after the schema passes.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 5     | PR    | Every provider's audio is rewritten by ffmpeg into one canonical WAV (mono, s16, 48 kHz) and measured with ffprobe; ElevenLabs is asked for raw `pcm_44100`. Providers take `fetch` and that audio step as injected dependencies, so the unit tests need neither network nor ffmpeg. `--only record` uses the cached durations and asks for `--only voice` when a line is missing.                                                                                                                                                                                                                                                                                                      |
| 6     | PR    | Font: Geist (SIL OFL 1.1), the app's own UI font; no question needed. Footage and voice are served to Remotion from a local HTTP server, so `out/` is never copied into the bundle. `colorSpace: 'bt709'` keeps the output `yuv420p` (limited range); without it the JPEG frames make it `yuvj420p`. The end card appears at its beat and the composition is extended only when the card would be on screen for less than 2.5 s. `state.ts` and the rerun table were brought forward from Phase 8, because this phase's acceptance needs "record skipped". `KM_SCREENCASTS_BROWSER` overrides Remotion's browser, since `remotion.media` was unreachable from the maintainer's network. |
| 7     | PR    | The follow zoom is a pure function of time: the target (callout anchor, moving cursor or whole window) averaged over the previous 400 ms with eased weights, then clamped to the footage. So `renderStill` of any frame matches the video. The cursor counts as moving from 700 ms before a sample to 200 ms after it. A callout zooms as far as fits the anchor with 90 px of padding, capped at 1.8×. Reel frames are `frames/reel-NN-<beat>.png`.                                                                                                                                                                                                                                    |
| 8     | PR    | `--open` and `--all` added; `--all` continues past a failure, prints a summary, and exits 1 if any video failed. The rerun table (Phase 6) is demonstrated row by row in the PR. The app row used a scratch mirror of the checkout with a changed `out/`, so the app itself was never touched.                                                                                                                                                                                                                                                                                                                                                                                          |
