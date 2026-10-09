import type { VideoArgs } from './cli';
import { UsageError } from './cli';
import { compareFrames, compareTiming, keepPreviousFrames, MAX_BEAT_DRIFT_FRAMES, MAX_DIFF_PERCENT } from './compare';
import { checkApp } from './harness/app';
import { checkTools } from './preflight';
import { record } from './record';
import { removeFrames, render } from './render';
import { formatsOf, loadScript, themeOf } from './script';
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
import { cachedLines, plannedLines, synthesizeLines } from './voice';

/** A failure that names the video and the stage, which is all the CLI prints. */
export class StageError extends Error {}

async function timed(id: string, stage: string, work: () => Promise<void>): Promise<void> {
    const started = performance.now();
    try {
        await work();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new StageError(`${id}  ${stage}  failed: ${message}`, { cause: error });
    }
    console.log(`${id}  ${stage}  ${((performance.now() - started) / 1000).toFixed(1)}s`);
}

const skipped = (id: string, stage: string) => console.log(`${id}  ${stage}  up to date`);

/**
 * Runs the stages of one video that need it: voice, then record, then render (PLAN.md section 7).
 * `--only` runs that one stage regardless; `--fresh` ignores every key.
 */
export async function runVideo(id: string, args: VideoArgs): Promise<void> {
    const script = loadScript(id);
    const theme = args.theme ?? themeOf(script);
    const formats = formatsOf(script).filter((format) => !args.format || format === args.format);
    if (formats.length === 0) {
        throw new UsageError(`${id} has no ${args.format} format (formats: ${formatsOf(script).join(', ')})`);
    }
    checkTools({ docker: !args.only || args.only === 'record' });
    let state: State = args.fresh ? {} : readState(id);
    let worked = false;

    // Voice first: its durations decide how long each beat waits, which is part of the scene key.
    const planned = plannedLines(script);
    if ((!args.only || args.only === 'voice') && planned.length > 0) {
        const before = cachedLines(script).size;
        if (args.fresh || before < planned.length) {
            await timed(id, 'voice', async () => {
                await synthesizeLines(script, { fresh: args.fresh });
            });
            worked = true;
        }
    }
    if (args.only === 'voice') return;

    const lines = cachedLines(script);
    if (planned.some((line) => !lines.has(line.beatId))) {
        throw new StageError(`${id}  record  needs its voice first: run \`npm run video -- ${id} --only voice\``);
    }
    const voiceMs = new Map([...lines].map(([beatId, line]) => [beatId, line.durationMs]));
    const voiceKeys = Object.fromEntries(planned.map((line) => [line.beatId, line.key]));

    let recorded = false;
    if (args.only !== 'render') {
        checkApp(script);
        const app = appKey();
        const scene = sceneKey(script, theme, voiceMs);
        const stale = !footageExists(id) || state.app !== app || state.scene !== scene;
        if (args.only === 'record' || args.fresh || stale) {
            await timed(id, 'record', () => record(script, { theme, voiceMs }));
            removeFrames(id);
            // The old renders were made from footage that no longer exists.
            state = { app, scene, voice: voiceKeys };
            writeState(id, state);
            recorded = true;
            worked = true;
        } else {
            skipped(id, 'record');
        }
    }
    if (args.only === 'record') return;

    if (!footageExists(id)) {
        throw new StageError(`${id}  render  has no recording yet: run \`npm run video -- ${id}\``);
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
            !outputsExist(id, format) ||
            (args.frames && !framesExist(id, format, script.beats.length)),
    );
    if (due.length > 0) {
        await timed(id, `render ${due.join('+')}`, () =>
            render(script, { formats: due, theme, voice: lines, frames: args.frames }),
        );
        state = {
            ...state,
            voice: voiceKeys,
            render: { ...state.render, ...Object.fromEntries(due.map((f) => [f, keys[f]])) },
        };
        writeState(id, state);
        worked = true;
    } else {
        skipped(id, 'render');
    }

    if (!worked) console.log(`${id} is up to date`);
}

/**
 * Renders the frames afresh and compares them with the ones the previous run left, frame by frame:
 * the check that two runs of the same scene look the same.
 */
export async function compareVideo(id: string, args: VideoArgs): Promise<void> {
    const hadPrevious = keepPreviousFrames(id);
    await runVideo(id, { ...args, frames: true });
    if (!hadPrevious) {
        console.log(`${id}  compare  no earlier frames; run again to compare with these`);
        return;
    }
    const diffs = compareFrames(id);
    for (const diff of diffs) {
        const verdict = diff.percent === null ? 'new' : diff.percent > MAX_DIFF_PERCENT ? 'DIFFERS' : 'same';
        const percent = diff.percent === null ? '-' : `${diff.percent.toFixed(2)}%`;
        console.log(`${id}  compare  ${diff.frame.padEnd(32)} ${percent.padStart(7)}  ${verdict}`);
    }
    const drifts = compareTiming(id);
    for (const drift of drifts) {
        const frames = drift.frames === null ? 'new' : `${drift.frames > 0 ? '+' : ''}${drift.frames} frames`;
        const late = drift.frames !== null && Math.abs(drift.frames) > MAX_BEAT_DRIFT_FRAMES;
        console.log(
            `${id}  compare  beat ${drift.beat.padEnd(27)} ${frames.padStart(10)}  ${late ? 'DRIFTS' : 'same'}`,
        );
    }
    const failed = diffs.filter((diff) => diff.percent !== null && diff.percent > MAX_DIFF_PERCENT);
    const drifted = drifts.filter((drift) => drift.frames !== null && Math.abs(drift.frames) > MAX_BEAT_DRIFT_FRAMES);
    if (failed.length > 0 || drifted.length > 0) {
        throw new StageError(
            `${id}  compare  ${failed.length} frame(s) differ by more than ${MAX_DIFF_PERCENT}%, ` +
                `${drifted.length} beat(s) moved by more than ${MAX_BEAT_DRIFT_FRAMES} frames`,
        );
    }
}
