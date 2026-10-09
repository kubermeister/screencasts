import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { readTimeline } from './timeline';
import { variantFiles, type Variant } from './variant';

/** Per-pixel colour distance below which two pixels count as the same (pixelmatch's 0–1 scale). */
const THRESHOLD = 0.1;
/** More differing pixels than this, in percent of a frame, fails the comparison. */
export const MAX_DIFF_PERCENT = 2;

export interface FrameDiff {
    frame: string;
    /** Percent of pixels that differ, or null when the frame has no counterpart to compare with. */
    percent: number | null;
}

/** Two runs' beats may start this many frames apart and still count as the same timing. */
export const MAX_BEAT_DRIFT_FRAMES = 2;

const framesDir = (variant: Variant) => variantFiles(variant).frames;
const previousDir = (variant: Variant) => variantFiles(variant).framesPrevious;
const previousTimeline = (variant: Variant) => join(previousDir(variant), 'timeline.json');

/** Keeps this run's starting frames aside as "the previous run"; false when there are none. */
export function keepPreviousFrames(variant: Variant): boolean {
    rmSync(previousDir(variant), { recursive: true, force: true });
    if (!existsSync(framesDir(variant)) || readdirSync(framesDir(variant)).length === 0) return false;
    cpSync(framesDir(variant), previousDir(variant), { recursive: true });
    const timeline = variantFiles(variant).timeline;
    if (existsSync(timeline)) cpSync(timeline, previousTimeline(variant));
    return true;
}

export function diffPercent(a: Buffer, b: Buffer): number {
    const left = PNG.sync.read(a);
    const right = PNG.sync.read(b);
    if (left.width !== right.width || left.height !== right.height) return 100;
    const differing = pixelmatch(left.data, right.data, null, left.width, left.height, { threshold: THRESHOLD });
    return (differing / (left.width * left.height)) * 100;
}

/** Each frame of this run against the same frame of the previous one. */
export function compareFrames(variant: Variant): FrameDiff[] {
    const files = readdirSync(framesDir(variant))
        .filter((file) => file.endsWith('.png'))
        .sort();
    return files.map((frame) => {
        const previous = join(previousDir(variant), frame);
        if (!existsSync(previous)) return { frame, percent: null };
        return { frame, percent: diffPercent(readFileSync(join(framesDir(variant), frame)), readFileSync(previous)) };
    });
}

export interface BeatDrift {
    beat: string;
    /** This run's start minus the previous run's, in frames; null when the beat is new. */
    frames: number | null;
}

/** How far each beat's start moved from the previous run, in frames at the footage rate. */
export function compareTiming(variant: Variant): BeatDrift[] {
    if (!existsSync(previousTimeline(variant))) return [];
    const before = readTimeline(previousTimeline(variant));
    const now = readTimeline(variantFiles(variant).timeline);
    return now.beats.map((beat) => {
        const earlier = before.beats.find((candidate) => candidate.id === beat.id);
        return {
            beat: beat.id,
            frames: earlier ? Math.round(((beat.startMs - earlier.startMs) * now.footage.fps) / 1000) : null,
        };
    });
}
