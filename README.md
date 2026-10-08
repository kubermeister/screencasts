# kubermeister/screencasts

Promo videos of [Kubermeister](https://github.com/kubermeister/kubermeister) features, generated from
committed text files. Per feature, `script.yml` holds the beats, the text shown on screen and the
voiceover; `scene.ts` drives the app through those beats with Playwright. One command records the
app, synthesizes the voice and renders a 16:9 video, a 9:16 reel and WebVTT captions.

Videos are generated locally only. Nobody edits a video by hand, and nothing in `out/` is committed.

## Environment

- macOS (Apple silicon, Retina), Docker Desktop running, Node 24 (`.nvmrc`), npm ≥ 11.19, `ffmpeg`
  on `PATH`. `helm` on `PATH` is optional: without it the Helm screens have no release.
- The app checked out next to this repository and built:

  ```
  ~/Projects/Kubermeister/
    kubermeister/      # the app (github.com/kubermeister/kubermeister): run `npm run build` there
    screencasts/       # this repository
  ```

  Set `KUBERMEISTER_APP` to an absolute path to use a checkout somewhere else. Whatever the app
  checkout is on (a branch, `main`, a tag) is what gets filmed.

## Commands

```sh
npm run video -- <id>                        # record → voice → render, only what changed
npm run video -- <id> --format video|reel    # one format only
npm run video -- <id> --only record|voice|render
npm run video -- <id> --fresh                # ignore every cache
npm run video -- <id> --frames               # also write out/<id>/frames/NN-<beat>.png
npm run video -- <id> --open                 # open the outputs when done
npm run video -- <id> --theme light          # override the script's theme for this run
npm run video -- --all                       # every folder in features/, overview/, hero/
npm run new -- <id>                          # scaffold features/<id>/ from a template
npm run cluster -- up|down|status            # manage the demo cluster explicitly
```

Exit codes: 0 success, 1 failure (the message names the feature and the stage), 2 usage error.

Before recording, the CLI checks that the app checkout exists and is built from its current sources,
that its version is at least the script's `since`, that Docker is reachable and that `ffmpeg` is on
`PATH`. Each failed check prints the fix.

The demo cluster (`km-screencasts-cluster`, a k3s container seeded from the app's
`tests/demo/fixtures/`) is kept between runs. `KM_SCREENCASTS_FRESH=1` or `npm run cluster -- down`
removes it.

### What reruns

`out/<id>/state.json` remembers what each stage was made from. Without `--only` or `--fresh`, only
the stages whose inputs changed run again:

| Input changed                                                            | Redone                         |
| ------------------------------------------------------------------------ | ------------------------------ |
| The app's built `out/`                                                   | record, render                 |
| `scene.ts`, beat ids or holds, voice durations, theme, `src/harness/`    | record, render                 |
| A beat's `say` or the voice settings                                     | that line, then record, render |
| Any other part of `script.yml`, `brand/`, `src/render/`, `src/remotion/` | render                         |

If nothing changed, the CLI prints `<id> is up to date`.

### Voice

Voiceover is optional per feature. Kokoro runs locally and is the default; its model is downloaded
on first use. OpenAI (`OPENAI_API_KEY`) and ElevenLabs (`ELEVENLABS_API_KEY`) read their keys from
the environment only.

## Outputs

```
out/
  voice/<sha256>.wav                 # shared voice cache, with <sha256>.json { durationMs }
  <id>/
    <id>-video.mp4                   # 1920×1080, 30 fps
    <id>-reel.mp4                    # 1080×1920, 30 fps
    <id>.vtt                         # WebVTT
    frames/NN-<beat>.png             # with --frames: the frame 300 ms into each beat
    footage.mp4                      # the raw recording (3200×1800, 30 fps)
    timeline.json                    # beats, anchors and cursor, the contract with the renderer
    state.json                       # cache keys
```

Both formats are H.264, `yuv420p`, 30 fps constant, CRF 18, `+faststart`, AAC 160 kb/s when there is
voice and no audio track otherwise, metadata stripped.

## Development

```sh
npm ci
npm run lint && npm run typecheck && npm run format:check && npm test
```

See `AGENTS.md` for the conventions and `PLAN.md` for the design.

Rendering uses [Remotion](https://www.remotion.dev) under its free license, which covers individuals
and companies of up to three employees.
