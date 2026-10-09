// Shared by both compositions and by the captions, and imported into the browser bundle: no Node.
import type { CalloutSide, Script, TextKind } from '../script';
import type { Box, CursorSample, Timeline } from '../timeline';

export interface Brand {
    font: { family: string; files: string[] };
    themes: Record<'dark' | 'light', Palette>;
    sizes: {
        title: number;
        caption: number;
        callout: number;
        endCard: number;
        reelText: number;
        reelCallout: number;
    };
    video: { width: number; height: number; captionBottom: number; captionMaxWidth: number; scrimOpacity: number };
    reel: {
        width: number;
        height: number;
        /** Where all of the reel's text goes, in frame px; nothing is drawn above it. */
        textBand: [number, number];
        /** The footage's area, in frame px. */
        stage: [number, number];
        /** Below this the platforms draw their own buttons, so focus stays above it. */
        visibleBottom: number;
        sideMargin: number;
        /** The narrowest crop of the window, in CSS px: how far a small element is enlarged. */
        minCropWidth: number;
        /** The crop's width while the cursor moves, in CSS px. */
        cursorCropWidth: number;
        /** Room kept around a callout's element inside the crop, in CSS px. */
        anchorPadding: number;
    };
    durations: { fadeMs: number; endCardMs: number; zoomEaseMs: number; calloutFollowMs: number };
}

export interface Palette {
    background: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    accentStrong: string;
    border: string;
    callout: string;
    calloutText: string;
}

/** Everything a composition renders from; built in Node, passed as input props. */
export interface RenderProps {
    timeline: Timeline;
    script: Pick<Script, 'id' | 'title' | 'beats'>;
    theme: 'dark' | 'light';
    brand: Brand;
    /** URLs the renderer can fetch: the footage, and each spoken line by beat id. */
    footageUrl: string;
    voice: { beatId: string; url: string }[];
    durationInFrames: number;
    [key: string]: unknown;
}

/** A piece of on-screen text and the time it is shown, in ms of the composition. */
export interface TextSpan {
    beatId: string;
    kind: TextKind;
    value: string;
    anchor?: string;
    side?: CalloutSide;
    startMs: number;
    endMs: number;
}

export const msToFrame = (ms: number, fps: number) => Math.round((ms * fps) / 1000);
export const frameToMs = (frame: number, fps: number) => (frame * 1000) / fps;

/**
 * How long the composition runs: the footage, extended when the end card would otherwise be on
 * screen for less than its minimum.
 */
export function compositionMs(timeline: Timeline, script: Pick<Script, 'beats'>, endCardMs: number): number {
    const footage = timeline.footage.durationMs;
    const endCard = script.beats.find((beat) => beat.text?.kind === 'end-card');
    const start = endCard && timeline.beats.find((beat) => beat.id === endCard.id)?.startMs;
    return start === undefined ? footage : Math.max(footage, start + endCardMs);
}

/**
 * When each beat's text is on screen: from its beat's start until the next beat with text starts.
 * An end card stays until the end.
 */
export function textSpans(timeline: Timeline, script: Pick<Script, 'beats'>, totalMs: number): TextSpan[] {
    const starts = new Map(timeline.beats.map((beat) => [beat.id, beat.startMs]));
    const withText = script.beats.filter((beat) => beat.text && starts.has(beat.id));
    return withText.map((beat, i) => {
        const text = beat.text!;
        const next = withText[i + 1];
        const endMs = text.kind === 'end-card' || !next ? totalMs : starts.get(next.id)!;
        return {
            beatId: beat.id,
            kind: text.kind,
            value: text.value,
            ...(text.anchor && { anchor: text.anchor }),
            ...(text.side && { side: text.side }),
            startMs: starts.get(beat.id)!,
            endMs,
        };
    });
}

export function spanAt(spans: TextSpan[], ms: number): TextSpan | undefined {
    return spans.find((span) => ms >= span.startMs && ms < span.endMs);
}

/** 0 → 1 over `fadeMs` after the start, 1 → 0 over `fadeMs` before the end. */
export function fadeOpacity(ms: number, startMs: number, endMs: number, fadeMs: number, fadeOut = true): number {
    const fadeIn = Math.min(1, Math.max(0, (ms - startMs) / fadeMs));
    const out = fadeOut ? Math.min(1, Math.max(0, (endMs - ms) / fadeMs)) : 1;
    return Math.min(fadeIn, out);
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function lerpBox(from: Box, to: Box, t: number): Box {
    const lerp = (a: number, b: number) => a + (b - a) * t;
    return { x: lerp(from.x, to.x), y: lerp(from.y, to.y), w: lerp(from.w, to.w), h: lerp(from.h, to.h) };
}

/**
 * Where a followed box is drawn at a moment. Each sample starts an eased glide over `easeMs` from
 * wherever the box was drawn at that moment towards the sampled position, so a callout follows a
 * moving element smoothly instead of jumping every 100 ms.
 */
export function boxAt(samples: { atMs: number; box: Box }[] | undefined, ms: number, easeMs: number): Box | undefined {
    if (!samples || samples.length === 0) return undefined;
    const progress = (from: number, to: number) =>
        easeInOut(Math.min(1, Math.max(0, (to - from) / Math.max(1, easeMs))));
    let from = samples[0]!.box;
    for (let k = 0; k < samples.length; k++) {
        const sample = samples[k]!;
        const next = samples[k + 1];
        if (!next || next.atMs > ms) return lerpBox(from, sample.box, progress(sample.atMs, Math.max(ms, sample.atMs)));
        from = lerpBox(from, sample.box, progress(sample.atMs, next.atMs));
    }
    return from;
}

/** The cursor at a moment, linearly between its samples. */
export function cursorAt(samples: CursorSample[], ms: number): { x: number; y: number } | undefined {
    if (samples.length === 0) return undefined;
    let prev = samples[0]!;
    for (const sample of samples) {
        if (sample.atMs >= ms) {
            const span = sample.atMs - prev.atMs;
            const t = span <= 0 ? 1 : (ms - prev.atMs) / span;
            return { x: prev.x + (sample.x - prev.x) * t, y: prev.y + (sample.y - prev.y) * t };
        }
        prev = sample;
    }
    return { x: prev.x, y: prev.y };
}

/**
 * The part of the window the reel shows: its centre and width in CSS px. Its height follows from the
 * width and the stage's shape (see `cropHeight`), so a crop is always as tall as the stage allows.
 */
export interface Crop {
    cx: number;
    cy: number;
    w: number;
}

export interface CropLimits {
    minCropWidth: number;
    cursorCropWidth: number;
    anchorPadding: number;
    /** The stage's height over its width: the shape a crop takes when the window is tall enough. */
    aspect: number;
    easeMs: number;
}

/** The cursor counts as moving from this long before a sample to this long after it. */
const CURSOR_ACTIVE_BEFORE_MS = 700;
const CURSOR_ACTIVE_AFTER_MS = 200;
const SMOOTHING_STEPS = 12;
/**
 * How much wider than a portrait crop a callout's element may make the crop before the crop stops
 * fitting it and shows its top-left part instead: a whole log list or diff fitted into 1080 px is
 * too small to read.
 */
const WIDEST_FIT = 1.25;

const clampTo = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function windowSize(timeline: Timeline): { width: number; height: number } {
    return { width: timeline.footage.width / timeline.scale, height: timeline.footage.height / timeline.scale };
}

/** A crop's height for its width: the stage's shape, cut off at the window's own height. */
export function cropHeight(width: number, aspect: number, windowHeight: number): number {
    return Math.min(windowHeight, width * aspect);
}

/**
 * Where the crop would be at a moment if it could jump. During a callout it fits the element and its
 * padding; while the cursor moves it is a tight crop on the cursor; otherwise it rests where the
 * cursor last was, as tall as the window, which at the start is the window's middle.
 */
export function cropTarget(timeline: Timeline, spans: TextSpan[], ms: number, limits: CropLimits): Crop {
    const { width, height } = windowSize(timeline);
    const resting = height / limits.aspect;
    const span = spanAt(spans, ms);
    if (span?.kind === 'callout' && span.anchor) {
        const box = boxAt(timeline.anchors[span.anchor], ms, 0);
        if (box) {
            const pad = limits.anchorPadding;
            // Wide enough for the element's width, and for its height once the width sets the height.
            const fit = Math.max(box.w + 2 * pad, (box.h + 2 * pad) / limits.aspect);
            if (fit > resting * WIDEST_FIT) return focusCrop(box, resting, limits, width);
            return { cx: box.x + box.w / 2, cy: box.y + box.h / 2, w: clampTo(fit, limits.minCropWidth, width) };
        }
    }
    // The first sample is where the cursor rests at the start; only later ones are movement.
    const moves = timeline.cursor.slice(1);
    const moving = moves.some(
        (sample) => sample.atMs >= ms - CURSOR_ACTIVE_AFTER_MS && sample.atMs <= ms + CURSOR_ACTIVE_BEFORE_MS,
    );
    if (moving) {
        const cursor = cursorAt(timeline.cursor, ms)!;
        return { cx: cursor.x, cy: cursor.y, w: limits.cursorCropWidth };
    }
    const last = [...timeline.cursor].reverse().find((sample) => sample.atMs <= ms) ?? timeline.cursor[0];
    const focus = [...(timeline.focus ?? [])].reverse().find((sample) => sample.atMs <= ms);
    // Whichever came last: what the scene pointed at, or where the cursor stopped.
    if (focus && (!last || focus.atMs >= last.atMs || last === timeline.cursor[0])) {
        return focusCrop(focus.box, resting, limits, width);
    }
    return { cx: last?.x ?? width / 2, cy: last?.y ?? height / 2, w: clampTo(resting, limits.minCropWidth, width) };
}

/**
 * A crop on something the scene said matters: the whole of it when it fits a portrait crop, else its
 * top-left part, where reading starts, rather than a wide crop of it too small to read.
 */
function focusCrop(box: Box, resting: number, limits: CropLimits, windowWidth: number): Crop {
    const pad = limits.anchorPadding;
    const w = clampTo(Math.min(box.w + 2 * pad, resting), limits.minCropWidth, windowWidth);
    const h = w * limits.aspect;
    const cx = box.w + 2 * pad <= w ? box.x + box.w / 2 : box.x - pad + w / 2;
    const cy = box.h + 2 * pad <= h ? box.y + box.h / 2 : box.y - pad + h / 2;
    return { cx, cy, w };
}

/** Keeps the crop inside the window: no edge of the footage ever comes into view. */
export function clampCrop(crop: Crop, timeline: Timeline, limits: Pick<CropLimits, 'minCropWidth' | 'aspect'>): Crop {
    const { width, height } = windowSize(timeline);
    const w = clampTo(crop.w, limits.minCropWidth, width);
    const h = cropHeight(w, limits.aspect, height);
    return { w, cx: clampTo(crop.cx, w / 2, width - w / 2), cy: clampTo(crop.cy, h / 2, height - h / 2) };
}

/**
 * The crop at a moment: the target averaged over the preceding `easeMs` with weights that favour the
 * present, which eases every pan and zoom over that time. It depends on the moment alone, so any
 * single frame renders the same as it does in the full video.
 */
export function cropAt(timeline: Timeline, spans: TextSpan[], ms: number, limits: CropLimits): Crop {
    let total = 0;
    const sum = { cx: 0, cy: 0, w: 0 };
    for (let i = 0; i <= SMOOTHING_STEPS; i++) {
        const weight = easeInOut(1 - i / (SMOOTHING_STEPS + 1));
        const at = Math.max(0, ms - (i * limits.easeMs) / SMOOTHING_STEPS);
        const target = clampCrop(cropTarget(timeline, spans, at, limits), timeline, limits);
        sum.cx += target.cx * weight;
        sum.cy += target.cy * weight;
        sum.w += target.w * weight;
        total += weight;
    }
    return clampCrop({ cx: sum.cx / total, cy: sum.cy / total, w: sum.w / total }, timeline, limits);
}
