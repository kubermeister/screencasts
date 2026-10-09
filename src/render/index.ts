import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { CACHE_DIR, FPS, OUT_DIR, ROOT, type Theme } from '../config';
import type { Format, Script } from '../script';
import { readTimeline } from '../timeline';
import type { CachedLine } from '../voice/cache';
import { compositionMs, msToFrame, type Brand, type RenderProps } from '../remotion/timing';
import { buildVtt } from './captions';
import { serveDirectory } from './server';

const run = promisify(execFile);

const COMPOSITION: Record<Format, string> = { video: 'Video', reel: 'Reel' };
/** A beat's frame is taken this far in, once its text has faded in. */
const FRAME_OFFSET_MS = 300;

/**
 * Remotion downloads its own Chrome Headless Shell on first use. Where its download host is not
 * reachable, any recent chrome-headless-shell works, e.g. Playwright's
 * (`npx playwright install chromium-headless-shell`).
 */
const browserExecutable = process.env.KM_SCREENCASTS_BROWSER ?? null;

let bundled: Promise<string> | undefined;

/** One bundle per run, shared by every format and every video of an `--all`. */
function serveUrl(): Promise<string> {
    bundled ??= bundle({
        entryPoint: join(ROOT, 'src/remotion/index.ts'),
        publicDir: join(ROOT, 'brand'),
        outDir: join(CACHE_DIR, 'remotion-bundle'),
    });
    return bundled;
}

export function readBrand(): Brand {
    return JSON.parse(readFileSync(join(ROOT, 'brand/brand.json'), 'utf8')) as Brand;
}

export interface RenderOptions {
    formats: Format[];
    theme: Theme;
    voice: ReadonlyMap<string, CachedLine>;
    frames: boolean;
}

/** Renders each format from out/<id>/footage.mp4 + timeline.json, and writes the captions. */
export async function render(script: Script, options: RenderOptions): Promise<void> {
    const outDir = join(OUT_DIR, script.id);
    const timeline = readTimeline(join(outDir, 'timeline.json'));
    const brand = readBrand();
    const totalMs = compositionMs(timeline, script, brand.durations.endCardMs);

    writeFileSync(join(outDir, `${script.id}.vtt`), buildVtt(timeline, script, totalMs));

    const assets = await serveDirectory(OUT_DIR);
    try {
        const props: RenderProps = {
            timeline,
            script: { id: script.id, title: script.title, beats: script.beats },
            theme: options.theme,
            brand,
            footageUrl: assets.url(relative(OUT_DIR, join(outDir, timeline.footage.file))),
            voice: [...options.voice].map(([beatId, line]) => ({
                beatId,
                url: assets.url(relative(OUT_DIR, line.file)),
            })),
            durationInFrames: Math.max(1, msToFrame(totalMs, FPS)),
        };
        const url = await serveUrl();
        for (const format of options.formats) {
            const composition = await selectComposition({
                serveUrl: url,
                id: COMPOSITION[format],
                inputProps: props,
                browserExecutable,
            });
            const output = join(outDir, `${script.id}-${format}.mp4`);
            const raw = join(CACHE_DIR, `${script.id}-${format}.raw.mp4`);
            await renderMedia({
                composition,
                serveUrl: url,
                inputProps: props,
                codec: 'h264',
                crf: 18,
                pixelFormat: 'yuv420p',
                // Tags the stream as limited-range BT.709, what players assume for HD video; without it
                // the JPEG frames carry full range through and the output is yuvj420p.
                colorSpace: 'bt709',
                imageFormat: 'jpeg',
                jpegQuality: 95,
                // No voice means no audio track at all, rather than a silent one.
                muted: props.voice.length === 0,
                audioCodec: 'aac',
                audioBitrate: '160k',
                outputLocation: raw,
                browserExecutable,
                logLevel: 'error',
            });
            await finalize(raw, output);
            if (options.frames) await renderFrames(script, timeline.beats, format, url, props, composition);
        }
    } finally {
        await assets.close();
    }
}

/** Strips metadata (encoder, creation time) and moves the index to the front for streaming. */
async function finalize(raw: string, output: string): Promise<void> {
    await run('ffmpeg', [
        ...['-y', '-v', 'error', '-i', raw, '-map', '0', '-c', 'copy'],
        ...['-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact', '-movflags', '+faststart', output],
    ]);
    rmSync(raw, { force: true });
}

async function renderFrames(
    script: Script,
    beats: { id: string; startMs: number }[],
    format: Format,
    serveUrl: string,
    props: RenderProps,
    composition: Awaited<ReturnType<typeof selectComposition>>,
): Promise<void> {
    const dir = join(OUT_DIR, script.id, 'frames');
    mkdirSync(dir, { recursive: true });
    const prefix = format === 'video' ? '' : `${format}-`;
    for (const [i, beat] of beats.entries()) {
        const frame = Math.min(composition.durationInFrames - 1, msToFrame(beat.startMs + FRAME_OFFSET_MS, FPS));
        await renderStill({
            composition,
            serveUrl,
            inputProps: props,
            frame,
            output: join(dir, `${prefix}${String(i + 1).padStart(2, '0')}-${beat.id}.png`),
            browserExecutable,
            logLevel: 'error',
        });
    }
}
