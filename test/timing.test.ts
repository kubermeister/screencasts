import { describe, expect, it } from 'vitest';
import { buildVtt } from '../src/render/captions';
import { estimateLabel, layoutCallout } from '../src/remotion/layout';
import {
    boxAt,
    clampViewport,
    compositionMs,
    fadeOpacity,
    msToFrame,
    spanAt,
    textSpans,
    viewportAt,
} from '../src/remotion/timing';
import type { Script } from '../src/script';
import type { Timeline } from '../src/timeline';

const script: Pick<Script, 'beats'> = {
    beats: [
        { id: 'intro', text: { kind: 'title', value: 'Hello' }, say: 'Hello there.' },
        { id: 'act' },
        { id: 'look', text: { kind: 'callout', value: 'Here', anchor: 'thing' } },
        { id: 'outro', text: { kind: 'end-card', value: 'Bye' } },
    ],
};

const timeline: Timeline = {
    version: 1,
    footage: { file: 'footage.mp4', width: 3200, height: 1800, fps: 30, durationMs: 10_000 },
    scale: 2,
    startEpochMs: 0,
    beats: [
        { id: 'intro', startMs: 500, endMs: 3000 },
        { id: 'act', startMs: 3000, endMs: 4000 },
        { id: 'look', startMs: 4000, endMs: 8500 },
        { id: 'outro', startMs: 8500, endMs: 10_000 },
    ],
    anchors: {},
    cursor: [],
};

describe('frames', () => {
    it('rounds ms to the nearest frame at 30 fps', () => {
        expect(msToFrame(0, 30)).toBe(0);
        expect(msToFrame(500, 30)).toBe(15);
        expect(msToFrame(1017, 30)).toBe(31);
    });
});

describe('compositionMs', () => {
    it('is the footage when the end card already has its 2.5 s', () => {
        expect(compositionMs(timeline, script, 1500)).toBe(10_000);
    });

    it('extends past the footage so the end card stays its full length', () => {
        expect(compositionMs(timeline, script, 2500)).toBe(11_000);
    });

    it('is the footage without an end card', () => {
        expect(compositionMs(timeline, { beats: script.beats.slice(0, 3) }, 2500)).toBe(10_000);
    });
});

describe('textSpans', () => {
    const spans = textSpans(timeline, script, 11_000);

    it('keeps a text on screen until the next beat with text, across a pure-action beat', () => {
        expect(spans.map((span) => [span.beatId, span.startMs, span.endMs])).toEqual([
            ['intro', 500, 4000],
            ['look', 4000, 8500],
            ['outro', 8500, 11_000],
        ]);
    });

    it('finds the span at a moment, and none before the first beat', () => {
        expect(spanAt(spans, 100)).toBeUndefined();
        expect(spanAt(spans, 3500)?.beatId).toBe('intro');
        expect(spanAt(spans, 10_999)?.beatId).toBe('outro');
    });
});

describe('fadeOpacity', () => {
    it('fades in and out over the fade', () => {
        expect(fadeOpacity(0, 0, 1000, 250)).toBe(0);
        expect(fadeOpacity(125, 0, 1000, 250)).toBe(0.5);
        expect(fadeOpacity(500, 0, 1000, 250)).toBe(1);
        expect(fadeOpacity(875, 0, 1000, 250)).toBe(0.5);
        expect(fadeOpacity(875, 0, 1000, 250, false)).toBe(1);
    });
});

describe('boxAt', () => {
    const a = { x: 0, y: 0, w: 100, h: 20 };
    const b = { x: 200, y: 100, w: 100, h: 20 };
    const samples = [
        { atMs: 0, box: a },
        { atMs: 1000, box: b },
    ];

    it('holds the first box until the next sample, then glides to it', () => {
        expect(boxAt(samples, 500, 150)).toEqual(a);
        expect(boxAt(samples, 1075, 150)).toEqual({ x: 100, y: 50, w: 100, h: 20 });
        expect(boxAt(samples, 2000, 150)).toEqual(b);
    });

    it('has nothing to follow without samples', () => {
        expect(boxAt(undefined, 0, 150)).toBeUndefined();
    });
});

describe('layoutCallout', () => {
    const frame = { w: 1920, h: 1080 };
    const label = estimateLabel('All text scales. Spacing and icons stay put.', 34, 640, 26);

    it('goes where there is most room', () => {
        expect(layoutCallout({ x: 600, y: 900, w: 700, h: 40 }, label, frame, 'auto').side).toBe('above');
        expect(layoutCallout({ x: 600, y: 60, w: 700, h: 40 }, label, frame, 'auto').side).toBe('below');
        expect(layoutCallout({ x: 60, y: 500, w: 100, h: 40 }, label, frame, 'auto').side).toBe('right');
    });

    it('honours an explicit side and keeps the label inside the frame', () => {
        const layout = layoutCallout({ x: 10, y: 500, w: 100, h: 40 }, label, frame, 'left');
        expect(layout.side).toBe('left');
        expect(layout.label.x).toBeGreaterThanOrEqual(32);
    });

    it('points the arrow from the label to the anchor', () => {
        const anchor = { x: 600, y: 600, w: 700, h: 40 };
        const layout = layoutCallout(anchor, label, frame, 'above');
        expect(layout.arrow.from.y).toBe(layout.label.y + layout.label.h);
        expect(layout.arrow.to.y).toBeLessThan(anchor.y);
    });
});

describe('buildVtt', () => {
    it('writes one cue per beat with text or speech, preferring the spoken line', () => {
        expect(buildVtt(timeline, script, 11_000)).toBe(
            [
                'WEBVTT',
                '',
                'intro',
                '00:00:00.500 --> 00:00:03.000',
                'Hello there.',
                '',
                'look',
                '00:00:04.000 --> 00:00:08.500',
                'Here',
                '',
                'outro',
                '00:00:08.500 --> 00:00:11.000',
                'Bye',
                '',
            ].join('\n'),
        );
    });
});

describe('the reel viewport', () => {
    const limits = { maxZoomCallout: 1.8, maxZoomCursor: 1.4, easeMs: 400 };
    const box = { x: 515, y: 516, w: 722, h: 36 };
    const zoomed: Timeline = {
        ...timeline,
        anchors: { thing: [{ atMs: 4000, box }] },
        cursor: [
            { atMs: 0, x: 800, y: 450, down: false },
            { atMs: 3000, x: 300, y: 200, down: false },
            { atMs: 3100, x: 320, y: 220, down: true },
        ],
    };
    const spans = textSpans(zoomed, script, 11_000);

    it('shows the whole window while nothing happens', () => {
        expect(viewportAt(zoomed, spans, 1500, limits)).toEqual({ zoom: 1, cx: 800, cy: 450 });
    });

    it('zooms onto a callout anchor as far as it fits, up to the limit', () => {
        const view = viewportAt(zoomed, spans, 5000, limits);
        expect(view.zoom).toBeCloseTo(Math.min(1.8, 1600 / (722 + 180)), 5);
        expect(view.cx).toBeCloseTo(box.x + box.w / 2, 5);
        expect(view.cy).toBeCloseTo(box.y + box.h / 2, 5);
    });

    it('follows the cursor while it moves, kept inside the window', () => {
        const view = viewportAt(zoomed, spans, 3100, limits);
        expect(view.zoom).toBeCloseTo(1.4, 5);
        // 320 would put the left edge of a 1.4× view outside the window.
        expect(view.cx).toBeCloseTo(1600 / 1.4 / 2, 5);
    });

    it('eases between targets instead of jumping', () => {
        const zooms = [3950, 4000, 4100, 4200, 4300, 4400].map((ms) => viewportAt(zoomed, spans, ms, limits).zoom);
        zooms.slice(1).forEach((zoom, i) => expect(zoom).toBeGreaterThanOrEqual(zooms[i]!));
        expect(zooms[1]).toBeLessThan(1.7);
        expect(zooms.at(-1)).toBeCloseTo(1.7738, 3);
    });

    it('never shows past the edge of the footage', () => {
        expect(clampViewport({ zoom: 2, cx: 0, cy: 900 }, 1600, 900)).toEqual({ zoom: 2, cx: 400, cy: 675 });
        expect(clampViewport({ zoom: 0.5, cx: 0, cy: 0 }, 1600, 900)).toEqual({ zoom: 1, cx: 800, cy: 450 });
    });
});
