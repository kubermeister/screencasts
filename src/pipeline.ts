import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { VideoArgs } from './cli';
import { UsageError } from './cli';
import { compareFrames, compareTiming, keepPreviousFrames, MAX_BEAT_DRIFT_FRAMES, MAX_DIFF_PERCENT } from './compare';
import { OUT_DIR, type Theme } from './config';
import { checkApp } from './harness/app';
import { checkTools } from './preflight';
import { record } from './record';
import { removeFrames, render } from './render';
import { formatsOf, loadScript, themeOf, type Format, type Script } from './script';
import {
    appKey,
    footageExists,
    footageKey,
    framesExist,
    outputsExist,
    readState,
    renderKey,
    sceneKey,
    writeState,
    type State,
} from './state';
import { declaredVariants, type Variant } from './variant';
import { cachedLines, plannedLines, synthesizeLines } from './voice';

/** A failure that names the video and the stage, which is all the CLI prints. */
export class StageError extends Error {}

async function timed(who: string, stage: string, work: () => Promise<void>): Promise<void> {
    const started = performance.now();
    try {
        await work();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new StageError(`${who}  ${stage}  failed: ${message}`, { cause: error });
    }
    console.log(`${who}  ${stage}  ${((performance.now() - started) / 1000).toFixed(1)}s`);
}

interface Run {
    script: Script;
    theme: Theme;
    formats: Format[];
    variants: Variant[];
}

/** The variants a run covers: the script's default (first) voice, the one `--voice` names, or all. */
async function prepare(id: string, args: VideoArgs): Promise<Run> {
    const script = loadScript(id);
    const theme = args.theme ?? themeOf(script);
    const formats = formatsOf(script).filter((format) => !args.format || format === args.format);
    if (formats.length === 0) {
        throw new UsageError(`${id} has no ${args.format} format (formats: ${formatsOf(script).join(', ')})`);
    }
    const declared = await declaredVariants(script, theme);
    let variants = [declared[0]!];
    if (args.voice === 'all') variants = declared;
    else if (args.voice !== undefined) {
        const named = declared.find((variant) => variant.label === args.voice || variant.name === args.voice);
        if (!named) {
            throw new UsageError(
                `${id} has no voice ${args.voice}; its voices: ${declared.map((v) => v.label).join(', ')}`,
            );
        }
        variants = [named];
    }
    return { script, theme, formats, variants };
}

/**
 * Runs the stages of a video that need it, once per variant: voice, then record, then render
 * (PLAN.md section 7). `--only` runs that one stage regardless; `--fresh` ignores every key.
 * Returns the variants it covered.
 */
export async function runVideo(id: string, args: VideoArgs): Promise<Variant[]> {
    const run = await prepare(id, args);
    checkTools({ docker: !args.only || args.only === 'record' });
    for (const variant of run.variants) await runVariant(run, variant, args);
    return run.variants;
}

async function runVariant({ script: declared, theme, formats }: Run, variant: Variant, args: VideoArgs): Promise<void> {
    // Each variant is the script with exactly one voice, so everything downstream reads `voice`.
    const script: Script = { ...declared, voice: variant.voice, voices: undefined };
    const who = `${script.id}  ${variant.name}`;
    let state: State = args.fresh ? {} : readState(variant);
    let worked = false;

    // Voice first: its durations decide how long each beat waits, which is part of the scene key.
    const planned = plannedLines(script);
    if ((!args.only || args.only === 'voice') && planned.length > 0) {
        const before = cachedLines(script).size;
        if (args.fresh || before < planned.length) {
            await timed(who, 'voice', async () => {
                await synthesizeLines(script, { fresh: args.fresh });
            });
            worked = true;
        }
    }
    if (args.only === 'voice') return;

    const lines = cachedLines(script);
    if (planned.some((line) => !lines.has(line.beatId))) {
        throw new StageError(
            `${who}  record  needs its voice first: run \`npm run video -- ${script.id} --only voice\``,
        );
    }
    const voiceMs = new Map([...lines].map(([beatId, line]) => [beatId, line.durationMs]));
    const voiceKeys = Object.fromEntries(planned.map((line) => [line.beatId, line.key]));

    let recorded = false;
    if (args.only !== 'render') {
        checkApp(script);
        const app = appKey();
        const scene = sceneKey(script, theme, voiceMs);
        const stale = !footageExists(variant) || state.app !== app || state.scene !== scene;
        if (args.only === 'record' || args.fresh || stale) {
            await timed(who, 'record', () => record(script, { variant, theme, voiceMs }));
            removeFrames(variant);
            // The old renders were made from footage that no longer exists.
            state = { app, scene, voice: voiceKeys };
            writeState(variant, state);
            recorded = true;
            worked = true;
        } else {
            console.log(`${who}  record  up to date`);
        }
    }
    if (args.only === 'record') return;

    if (!footageExists(variant)) {
        throw new StageError(`${who}  render  has no recording yet: run \`npm run video -- ${script.id}\``);
    }
    const footage = footageKey(state);
    const keys = Object.fromEntries(
        formats.map((format) => [format, renderKey(script, format, theme, footage, voiceKeys)]),
    );
    const due = formats.filter(
        (format) =>
            args.only === 'render' ||
            args.fresh ||
            recorded ||
            state.render?.[format] !== keys[format] ||
            !outputsExist(variant, format) ||
            (args.frames && !framesExist(variant, format, script.beats.length)),
    );
    if (due.length > 0) {
        await timed(who, `render ${due.join('+')}`, () =>
            render(script, { variant, formats: due, theme, voice: lines, frames: args.frames }),
        );
        state = {
            ...state,
            voice: voiceKeys,
            render: { ...state.render, ...Object.fromEntries(due.map((f) => [f, keys[f]])) },
        };
        writeState(variant, state);
        worked = true;
    } else {
        console.log(`${who}  render  up to date`);
    }

    if (!worked) console.log(`${who}  is up to date`);
}

/**
 * Renders the frames afresh and compares them with the ones the previous run of the same variant
 * left, frame by frame: the check that two runs of the same scene look the same.
 */
export async function compareVideo(id: string, args: VideoArgs): Promise<Variant[]> {
    const run = await prepare(id, args);
    checkTools({ docker: !args.only || args.only === 'record' });
    const problems: string[] = [];
    for (const variant of run.variants) {
        const who = `${id}  ${variant.name}`;
        const hadPrevious = keepPreviousFrames(variant);
        await runVariant(run, variant, { ...args, frames: true });
        if (!hadPrevious) {
            console.log(`${who}  compare  no earlier frames; run again to compare with these`);
            continue;
        }
        const diffs = compareFrames(variant);
        for (const diff of diffs) {
            const verdict = diff.percent === null ? 'new' : diff.percent > MAX_DIFF_PERCENT ? 'DIFFERS' : 'same';
            const percent = diff.percent === null ? '-' : `${diff.percent.toFixed(2)}%`;
            console.log(`${who}  compare  ${diff.frame.padEnd(32)} ${percent.padStart(7)}  ${verdict}`);
        }
        const drifts = compareTiming(variant);
        for (const drift of drifts) {
            const frames = drift.frames === null ? 'new' : `${drift.frames > 0 ? '+' : ''}${drift.frames} frames`;
            const late = drift.frames !== null && Math.abs(drift.frames) > MAX_BEAT_DRIFT_FRAMES;
            console.log(
                `${who}  compare  beat ${drift.beat.padEnd(27)} ${frames.padStart(10)}  ${late ? 'DRIFTS' : 'same'}`,
            );
        }
        const failed = diffs.filter((diff) => diff.percent !== null && diff.percent > MAX_DIFF_PERCENT).length;
        const drifted = drifts.filter((d) => d.frames !== null && Math.abs(d.frames) > MAX_BEAT_DRIFT_FRAMES).length;
        if (failed > 0 || drifted > 0) {
            problems.push(
                `${who}  compare  ${failed} frame(s) differ by more than ${MAX_DIFF_PERCENT}%, ` +
                    `${drifted} beat(s) moved by more than ${MAX_BEAT_DRIFT_FRAMES} frames`,
            );
        }
    }
    if (problems.length > 0) throw new StageError(problems.join('\n'));
    return run.variants;
}

function sizeOf(dir: string): number {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .reduce((sum, entry) => sum + statSync(join(entry.parentPath, entry.name)).size, 0);
}

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** Prints every variant made so far and every one the script declares but nobody has rendered. */
export async function listVariants(id: string, args: VideoArgs): Promise<void> {
    const { variants: declared } = await prepare(id, { ...args, voice: 'all' });
    const dir = join(OUT_DIR, id);
    const made = existsSync(dir)
        ? readdirSync(dir, { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name)
              .sort()
        : [];
    const names = [...new Set([...declared.map((variant) => variant.name), ...made])];
    console.log(`${id} variants (${declared[0]!.theme} theme):`);
    for (const name of names) {
        const index = declared.findIndex((variant) => variant.name === name);
        const role = index === 0 ? 'default' : index > 0 ? `voices[${index}]` : 'not in the script';
        const size = made.includes(name) ? megabytes(sizeOf(join(dir, name))) : 'not rendered';
        console.log(`  ${name.padEnd(56)} ${size.padStart(12)}  ${role}`);
    }
}

/** Deletes one variant's folder; the name must be one of the video's variants, nothing else. */
export function removeVariant(id: string, name: string): void {
    const root = resolve(OUT_DIR, id);
    const target = resolve(root, name);
    if (!target.startsWith(root + sep) || target.slice(root.length + 1).includes(sep) || !existsSync(target)) {
        throw new UsageError(`${id} has no variant ${name}; list them with \`npm run video -- ${id} --variants\``);
    }
    const size = sizeOf(target);
    rmSync(target, { recursive: true, force: true });
    console.log(`${id}  removed ${name} (${megabytes(size)})`);
}
