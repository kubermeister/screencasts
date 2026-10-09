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
        topBand: [number, number];
        panel: [number, number];
        bottomBand: [number, number];
        sideMargin: number;
        maxZoomCallout: number;
        maxZoomCursor: number;
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
