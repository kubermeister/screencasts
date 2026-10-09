import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CACHE_DIR, OUT_DIR, type Theme } from './config';
import { launch } from './harness/app';
import { ensureCluster } from './harness/cluster';
import { injectCursor } from './harness/cursor';
import { Stage } from './harness/director';
import { Recorder } from './harness/recorder';
import type { Scene } from './harness/scene';
import { videoDir, type Script } from './script';
import { writeTimeline } from './timeline';

/** Silence before the first beat and after the last, so neither starts or ends on a cut. */
const LEAD_IN_MS = 500;
const TAIL_MS = 1_500;

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

async function loadScene(id: string): Promise<Scene> {
    const module = (await import(pathToFileURL(join(videoDir(id), 'scene.ts')).href)) as { default?: Scene };
    if (!module.default?.run) throw new Error(`${id}/scene.ts must default-export defineScene({ run, ... })`);
    return module.default;
}

export interface RecordOptions {
    theme: Theme;
    /** Measured spoken-line lengths by beat id. */
    voiceMs: ReadonlyMap<string, number>;
}

/** Writes out/<id>/footage.mp4 and timeline.json. Each recording gets its own launch of the app. */
export async function record(script: Script, options: RecordOptions): Promise<void> {
    const scene = await loadScene(script.id);
    const outDir = join(OUT_DIR, script.id);
    mkdirSync(outDir, { recursive: true });

    await ensureCluster();
    const launched = await launch({ theme: options.theme });
    try {
        await injectCursor(launched.window);
        const stage = new Stage(script, launched.window, launched.app, options.voiceMs);
        const director = stage.director();

        await scene.setup?.(director);
        await stage.centreCursor();

        const recorder = new Recorder(launched.window, join(CACHE_DIR, 'frames', script.id));
        await recorder.start();
        stage.startRecording(recorder.startEpochMs);
        await sleep(LEAD_IN_MS);
        stage.enter('run');
        try {
            await scene.run(director);
            await stage.finishRun();
            await sleep(TAIL_MS);
        } catch (error) {
            await recorder.stop().catch(() => undefined);
            throw error;
        }
        const recording = await recorder.stop();

        stage.enter('cleanup');
        await scene.cleanup?.(director);

        await recorder.encode(recording, join(outDir, 'footage.mp4'));
        writeTimeline(join(outDir, 'timeline.json'), stage.timeline(recording));
    } finally {
        await launched.close();
    }
}
