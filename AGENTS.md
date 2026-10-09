# Working on kubermeister/screencasts

This repository turns committed `script.yml` + `scene.ts` files into promo videos of Kubermeister
features. `PLAN.md` is the design; read it before changing anything structural.

## Rules

- **Plan before code.** Say in a few lines what you will do and which files you will touch, then do it.
- **Do not modify the app repository** (`../kubermeister`). Read it freely: the harness follows its
  `tests/demo/harness/` and takes selectors from `tests/demo/shots/screenshots.test.ts`.
- **Branches and pull requests only** (`gh pr create`). Never commit on `main`, never merge: the
  maintainer merges.
- **Commit messages:** Conventional Commits, `type(scope): subject`, lowercase imperative subject,
  header ≤ 72 characters, **no trailers** (no `Co-Authored-By`, no `Signed-off-by`). Scopes: `repo`
  `ci` `deps` `docs` `cli` `harness` `voice` `render` `features` `brand`.
- **Comments explain why, not what.** Never `any` in TypeScript.
- After every change: `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test`.
- **Secrets** (API keys) come from the environment or from `.env` at the repository root, which is
  git-ignored (`.env.example` lists every variable). Never write a key to a tracked file. A variable
  the code reads is listed in `.env.example`; `test/repo.test.ts` checks it.
- Dependencies are pinned to exact versions; `remotion` and every `@remotion/*` share one version.
- Outputs (`out/`) and caches (`.cache/`) are never committed. CI never records or renders.

## Adding a feature video

```sh
npm run new -- <id>                  # scaffolds features/<id>/script.yml and scene.ts
npm run video -- <id> --frames       # record, voice, render; one PNG per beat in out/<id>/frames/
```

Check every beat's frame shows what its text says, and fix the scene until it does.

A video introduces a feature and never names a release: no version in any `text` or `say`, and the
end card is `kubermeister.dev` (the logo is drawn with it), never spoken. `since` only gates the
pre-flight.
