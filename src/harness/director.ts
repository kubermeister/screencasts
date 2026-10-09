import type { ElectronApplication, Locator, Page } from 'playwright';
import { FOOTAGE, FPS, SCALE, WINDOW } from '../config';
import { beatAnchors, holdMs, type Script } from '../script';
import type { Box, CursorSample, Timeline } from '../timeline';
import { clusterKubectl } from './cluster';
import type { Recording } from './recorder';

/** What `setup`, `run` and `cleanup` are given; see the director API in PLAN.md. */
export interface Director {
    window: Page;
    app: ElectronApplication;
    goto(path: string): Promise<void>;
    beat(id: string): Promise<void>;
    anchor(name: string, locator: Locator): void;
    focus(locator: Locator): Promise<void>;
    glide(locator: Locator): Promise<void>;
    click(locator: Locator): Promise<void>;
    type(text: string): Promise<void>;
    press(keys: string): Promise<void>;
    hold(ms: number): Promise<void>;
    kubectl(args: string[], input?: string): string;
}

/** A spoken line always finishes, plus this breath, before the scene moves on. */
const VOICE_TAIL_MS = 300;
const VISIBLE_TIMEOUT_MS = 60_000;
const ANCHOR_SAMPLE_MS = 100;
const GLIDE_STEP_MS = 16;
const TYPE_KEY_MS = 90;

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
/**
 * Steps are timed against a deadline, not a delay after each one: every mouse move and key press is
 * a DevTools round trip of a few ms, which relative sleeps would add up into frames of drift.
 */
const sleepUntil = (epochMs: number) => sleep(Math.max(0, epochMs - Date.now()));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Mid-recording errors name the scene's mistake, not the harness's. */
export class SceneError extends Error {}

/**
 * Drives one recording. Everything is stamped in epoch ms while recording and converted to times
 * relative to the first frame once the recording knows when that was.
 */
export class Stage {
    private phase: 'setup' | 'run' | 'cleanup' = 'setup';
    private readonly marked: { id: string; atEpochMs: number }[] = [];
    private readonly anchors = new Map<string, Locator>();
    private readonly anchorSamples = new Map<string, { atEpochMs: number; box: Box }[]>();
    private readonly focusSamples: { atEpochMs: number; box: Box }[] = [];
    private readonly cursor: (Omit<CursorSample, 'atMs'> & { atEpochMs: number })[] = [];
    private position = { x: WINDOW.width / 2, y: WINDOW.height / 2 };
    private stopSampling: (() => Promise<void>) | undefined;
    private readonly usedAnchors: Set<string>;

    constructor(
        private readonly script: Script,
        private readonly window: Page,
        private readonly app: ElectronApplication,
        /** Measured lengths of the spoken lines, by beat id; absent means silent. */
        private readonly voiceMs: ReadonlyMap<string, number>,
    ) {
        this.usedAnchors = new Set(script.beats.flatMap(beatAnchors));
    }

    enter(phase: 'run' | 'cleanup'): void {
        this.phase = phase;
    }

    /** Puts the drawn cursor in the middle of the window, where the recording starts. */
    async centreCursor(): Promise<void> {
        await this.window.mouse.move(this.position.x, this.position.y);
    }

    /** The first cursor sample, at the first frame. */
    startRecording(startEpochMs: number): void {
        this.cursor.push({ atEpochMs: startEpochMs, ...this.position, down: false });
    }

    director(): Director {
        return {
            window: this.window,
            app: this.app,
            goto: (path) => this.goto(path),
            beat: (id) => this.beat(id),
            anchor: (name, locator) => this.anchor(name, locator),
            focus: (locator) => this.focus(locator),
            glide: (locator) => this.glide(locator),
            click: (locator) => this.click(locator),
            type: (text) => this.type(text),
            press: async (keys) => {
                await this.window.keyboard.press(keys);
                await sleep(200);
            },
            hold: (ms) => sleep(ms),
            kubectl: (args, input) => clusterKubectl(args, input),
        };
    }

    private async goto(path: string): Promise<void> {
        await this.window.evaluate((hash) => {
            globalThis.location.hash = hash;
        }, `#${path}`);
        // The route's first paint and first read, before anything waits on content.
        await sleep(400);
    }

    private async beat(id: string): Promise<void> {
        if (this.phase !== 'run') throw new SceneError(`beat('${id}') is only allowed in run()`);
        const beat = this.script.beats.find((candidate) => candidate.id === id);
        if (!beat) throw new SceneError(`beat('${id}') is not a beat of ${this.script.id}/script.yml`);
        if (this.marked.some((mark) => mark.id === id)) throw new SceneError(`beat('${id}') is marked twice`);

        await this.stopSampling?.();
        this.stopSampling = undefined;
        const atEpochMs = Date.now();
        this.marked.push({ id, atEpochMs });
        await this.sampleAnchors([...this.anchors.keys()]);
        // A callout's label and a zoom both follow their element, so its box is sampled while the beat lasts.
        const followed = beatAnchors(beat);
        if (followed.length > 0) this.stopSampling = this.follow(followed);

        const voice = this.voiceMs.get(id);
        const wait = Math.max(holdMs(beat), voice === undefined ? 0 : voice + VOICE_TAIL_MS);
        await sleep(Math.max(0, atEpochMs + wait - Date.now()));
    }

    /**
     * Marks what matters on screen from now on. The 16:9 video shows the whole window anyway; the
     * reel, which shows a crop, rests on it whenever no callout or cursor movement needs the crop.
     * Called in setup, it is where the reel starts.
     */
    private async focus(locator: Locator): Promise<void> {
        if (this.phase === 'cleanup') throw new SceneError('focus() is not allowed in cleanup()');
        await locator.waitFor({ state: 'visible', timeout: VISIBLE_TIMEOUT_MS });
        const box = await locator.boundingBox();
        if (!box) throw new SceneError(`focus: ${String(locator)} has no box`);
        this.focusSamples.push({ atEpochMs: Date.now(), box: { x: box.x, y: box.y, w: box.width, h: box.height } });
    }

    private anchor(name: string, locator: Locator): void {
        if (!this.usedAnchors.has(name)) {
            throw new SceneError(
                `anchor('${name}') is not used by any callout or zoom in ${this.script.id}/script.yml`,
            );
        }
        this.anchors.set(name, locator);
    }

    private async sampleAnchors(names: string[]): Promise<void> {
        const atEpochMs = Date.now();
        await Promise.all(
            names.map(async (name) => {
                const box = await this.anchors
                    .get(name)
                    ?.boundingBox({ timeout: 1_000 })
                    .catch(() => null);
                if (!box) return;
                const samples = this.anchorSamples.get(name) ?? [];
                samples.push({ atEpochMs, box: { x: box.x, y: box.y, w: box.width, h: box.height } });
                this.anchorSamples.set(name, samples);
            }),
        );
    }

    /** Samples a beat's anchors while it lasts, so a callout or a zoom follows a box that moves. */
    private follow(names: string[]): () => Promise<void> {
        let running = true;
        const loop = (async () => {
            while (running) {
                await sleep(ANCHOR_SAMPLE_MS);
                if (running) await this.sampleAnchors(names);
            }
        })();
        return async () => {
            running = false;
            await loop;
        };
    }

    private async glide(locator: Locator): Promise<void> {
        await locator.waitFor({ state: 'visible', timeout: VISIBLE_TIMEOUT_MS });
        await locator.scrollIntoViewIfNeeded();
        const box = await locator.boundingBox();
        if (!box) throw new SceneError(`glide: ${String(locator)} has no box`);
        const from = this.position;
        const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const steps = clamp(Math.round(Math.hypot(to.x - from.x, to.y - from.y) / 18), 12, 45);
        const start = Date.now();
        for (let i = 1; i <= steps; i++) {
            const t = easeInOut(i / steps);
            const x = from.x + (to.x - from.x) * t;
            const y = from.y + (to.y - from.y) * t;
            await this.window.mouse.move(x, y);
            this.position = { x, y };
            this.cursor.push({ atEpochMs: Date.now(), x, y, down: false });
            await sleepUntil(start + i * GLIDE_STEP_MS);
        }
    }

    private async type(text: string): Promise<void> {
        const start = Date.now();
        for (const [i, key] of [...text].entries()) {
            await this.window.keyboard.type(key);
            await sleepUntil(start + (i + 1) * TYPE_KEY_MS);
        }
    }

    private async click(locator: Locator): Promise<void> {
        await this.glide(locator);
        await sleep(150);
        await this.window.mouse.down();
        this.cursor.push({ atEpochMs: Date.now(), ...this.position, down: true });
        await this.window.mouse.up();
        this.cursor.push({ atEpochMs: Date.now(), ...this.position, down: false });
        await sleep(250);
    }

    /** Ends the run: stops sampling and checks every beat of the script was marked, in order. */
    async finishRun(): Promise<void> {
        await this.stopSampling?.();
        this.stopSampling = undefined;
        const expected = this.script.beats.map((beat) => beat.id);
        const missing = expected.filter((id) => !this.marked.some((mark) => mark.id === id));
        if (missing.length > 0) {
            throw new SceneError(
                `${this.script.id}: run() never marked beat ${missing.map((id) => `'${id}'`).join(', ')}`,
            );
        }
        const order = this.marked.map((mark) => mark.id);
        const wrong = expected.findIndex((id, i) => order[i] !== id);
        if (wrong !== -1) {
            throw new SceneError(
                `${this.script.id}: beat '${expected[wrong]}' was marked out of order (script: ${expected.join(', ')}; scene: ${order.join(', ')})`,
            );
        }
    }

    timeline(recording: Recording): Timeline {
        const rel = (epochMs: number) => Math.max(0, Math.round(epochMs - recording.startEpochMs));
        const durationMs = rel(recording.endEpochMs);
        return {
            version: 1,
            footage: { file: 'footage.mp4', width: FOOTAGE.width, height: FOOTAGE.height, fps: FPS, durationMs },
            scale: SCALE,
            startEpochMs: Math.round(recording.startEpochMs),
            beats: this.marked.map((mark, i) => ({
                id: mark.id,
                startMs: rel(mark.atEpochMs),
                endMs: i + 1 < this.marked.length ? rel(this.marked[i + 1]!.atEpochMs) : durationMs,
            })),
            anchors: Object.fromEntries(
                [...this.anchorSamples].map(([name, samples]) => [
                    name,
                    samples.map((sample) => ({ atMs: rel(sample.atEpochMs), box: roundBox(sample.box) })),
                ]),
            ),
            focus: this.focusSamples.map((sample) => ({ atMs: rel(sample.atEpochMs), box: roundBox(sample.box) })),
            cursor: this.cursor.map(({ atEpochMs, x, y, down }) => ({
                atMs: rel(atEpochMs),
                x: Math.round(x * 10) / 10,
                y: Math.round(y * 10) / 10,
                down,
            })),
        };
    }
}

function roundBox(box: Box): Box {
    const round = (value: number) => Math.round(value * 10) / 10;
    return { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) };
}
