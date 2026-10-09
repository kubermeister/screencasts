import { readFileSync, writeFileSync } from 'node:fs';

export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface CursorSample {
    atMs: number;
    x: number;
    y: number;
    down: boolean;
}

/**
 * The contract between recording and rendering. All times are relative to the first frame; boxes
 * and the cursor are in CSS px (multiply by `scale` for footage px).
 */
export interface Timeline {
    version: 1;
    footage: { file: string; width: number; height: number; fps: number; durationMs: number };
    scale: number;
    /** The first frame's timestamp. */
    startEpochMs: number;
    /** A beat lasts from its start until the next beat starts; the last one until the footage ends. */
    beats: { id: string; startMs: number; endMs: number }[];
    anchors: Record<string, { atMs: number; box: Box }[]>;
    /** What the scene said matters, each time it said so; the reel rests on the latest. */
    focus?: { atMs: number; box: Box }[];
    /** The element each glide headed for, when it set off: what the cursor is about to touch. */
    targets?: { atMs: number; box: Box }[];
    cursor: CursorSample[];
}

export function readTimeline(path: string): Timeline {
    return JSON.parse(readFileSync(path, 'utf8')) as Timeline;
}

export function writeTimeline(path: string, timeline: Timeline): void {
    writeFileSync(path, `${JSON.stringify(timeline, null, 2)}\n`);
}
