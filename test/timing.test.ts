import { describe, expect, it } from 'vitest';
import { buildVtt } from '../src/render/captions';
import { estimateLabel, layoutCallout } from '../src/remotion/layout';
import { boxAt, compositionMs, fadeOpacity, msToFrame, spanAt, textSpans } from '../src/remotion/timing';
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
