import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { CACHE_DIR, FPS, OUT_DIR, ROOT, type Theme } from '../config';
import type { Format, Script } from '../script';
import { readTimeline } from '../timeline';
import type { CachedLine } from '../voice/cache';
import { compositionMs, msToFrame, type Brand, type RenderProps } from '../remotion/timing';
import { renderBrowser } from './browser';
import { variantFiles, type Variant } from '../variant';
import { buildVtt } from './captions';
import { serveDirectory } from './server';

const run = promisify(execFile);

const COMPOSITION: Record<Format, string> = { video: 'Video', reel: 'Reel' };
/**
 * A beat's frame is taken this far in: after its text has faded in (250 ms) and the reel's zoom has
 * eased (400 ms), so a frame or two of timing difference between runs does not read as a change.
 */
const FRAME_OFFSET_MS = 600;

const browserExecutable = renderBrowser();

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
    variant: Variant;
    formats: Format[];
    theme: Theme;
    voice: ReadonlyMap<string, CachedLine>;
    frames: boolean;
}

/** Renders each format from the variant's footage.mp4 + timeline.json, and writes its captions. */
export async function render(script: Script, options: RenderOptions): Promise<void> {
    const files = variantFiles(options.variant);
    const timeline = readTimeline(files.timeline);
    const brand = readBrand();
    const totalMs = compositionMs(timeline, script, brand.durations.endCardMs);

    writeFileSync(files.captions, buildVtt(timeline, script, totalMs));

    const assets = await serveDirectory(OUT_DIR);
    try {
        const props: RenderProps = {
            timeline,
            script: { id: script.id, title: script.title, beats: script.beats },
            theme: options.theme,
            brand,
            footageUrl: assets.url(relative(OUT_DIR, join(options.variant.dir, timeline.footage.file))),
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
            const output = files.video(format);
            const raw = join(CACHE_DIR, `${script.id}--${format}--${options.variant.name}.raw.mp4`);
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
            // Frames of an earlier render would pass for this one's; a format's frames go with it.
            removeFrames(options.variant, format);
            if (options.frames) await renderFrames(options.variant, timeline.beats, format, url, props, composition);
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

function framePrefix(format: Format): string {
    return format === 'video' ? '' : `${format}-`;
}

export function removeFrames(variant: Variant, format?: Format): void {
    const dir = variantFiles(variant).frames;
    if (!existsSync(dir)) return;
    const pattern = format ? new RegExp(`^${framePrefix(format)}\\d\\d-.*\\.png$`) : /\.png$/;
    for (const file of readdirSync(dir)) if (pattern.test(file)) rmSync(join(dir, file));
}

async function renderFrames(
    variant: Variant,
    beats: { id: string; startMs: number }[],
    format: Format,
    serveUrl: string,
    props: RenderProps,
    composition: Awaited<ReturnType<typeof selectComposition>>,
): Promise<void> {
    const dir = variantFiles(variant).frames;
    mkdirSync(dir, { recursive: true });
    const prefix = framePrefix(format);
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
