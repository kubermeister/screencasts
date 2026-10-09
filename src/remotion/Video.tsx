import { useMemo } from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Callout } from './components/Callout';
import { Caption } from './components/Caption';
import { EndCard } from './components/EndCard';
import { Title } from './components/Title';
import { useBrandFont } from './fonts';
import { estimateLabel, layoutCallout } from './layout';
import {
    boxAt,
    cameraAt,
    fadeOpacity,
    frameToMs,
    msToFrame,
    spanAt,
    textSpans,
    zoomSpans,
    type RenderProps,
} from './timing';

const CALLOUT_MAX_WIDTH = 640;
const CALLOUT_PADDING = 26;

/** 16:9: the footage fills the frame, zooming in on a beat's `zoom`, and the text sits over it. */
export function Video(props: RenderProps) {
    const { timeline, script, brand, theme } = props;
    useBrandFont(brand);
    const frame = useCurrentFrame();
    const { fps, width, height, durationInFrames } = useVideoConfig();
    const ms = frameToMs(frame, fps);
    const totalMs = frameToMs(durationInFrames, fps);
    const spans = useMemo(() => textSpans(timeline, script, totalMs), [timeline, script, totalMs]);
    const span = spanAt(spans, ms);
    const palette = brand.themes[theme];
    const fade = brand.durations.fadeMs;
    const zooms = useMemo(() => zoomSpans(timeline, script), [timeline, script]);
    const windowW = timeline.footage.width / timeline.scale;
    const windowH = timeline.footage.height / timeline.scale;
    const camera = cameraAt(timeline, zooms, ms, {
        maxZoom: brand.video.maxZoom,
        padding: brand.video.zoomPadding,
        easeMs: brand.durations.zoomEaseMs,
    });
    // CSS px of the recorded window → frame px, through the camera: whatever it shows fills the frame.
    const k = width / camera.w;
    const originX = camera.cx - camera.w / 2;
    const originY = camera.cy - (camera.w * windowH) / windowW / 2;
    const beatStart = (id: string) => timeline.beats.find((beat) => beat.id === id)?.startMs ?? 0;

    let overlay = null;
    if (span?.kind === 'title') {
        overlay = <Title value={span.value} brand={brand} opacity={fadeOpacity(ms, span.startMs, span.endMs, fade)} />;
    } else if (span?.kind === 'caption') {
        overlay = (
            <AbsoluteFill
                style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: brand.video.captionBottom }}
            >
                <Caption
                    value={span.value}
                    brand={brand}
                    palette={palette}
                    fontSize={brand.sizes.caption}
                    maxLines={2}
                    opacity={fadeOpacity(ms, span.startMs, span.endMs, fade)}
                    style={{ maxWidth: brand.video.captionMaxWidth }}
                />
            </AbsoluteFill>
        );
    } else if (span?.kind === 'callout' && span.anchor) {
        const css = boxAt(timeline.anchors[span.anchor], ms, brand.durations.calloutFollowMs);
        if (css) {
            const anchor = { x: (css.x - originX) * k, y: (css.y - originY) * k, w: css.w * k, h: css.h * k };
            const label = estimateLabel(span.value, brand.sizes.callout, CALLOUT_MAX_WIDTH, CALLOUT_PADDING);
            overlay = (
                <Callout
                    value={span.value}
                    anchor={anchor}
                    layout={layoutCallout(anchor, label, { w: width, h: height }, span.side ?? 'auto')}
                    brand={brand}
                    palette={palette}
                    fontSize={brand.sizes.callout}
                    opacity={fadeOpacity(ms, span.startMs, span.endMs, fade)}
                />
            );
        }
    } else if (span?.kind === 'end-card') {
        overlay = (
            <EndCard
                value={span.value}
                brand={brand}
                palette={palette}
                fontSize={brand.sizes.endCard}
                opacity={fadeOpacity(ms, span.startMs, span.endMs, fade, false)}
            />
        );
    }

    return (
        <AbsoluteFill style={{ backgroundColor: palette.background }}>
            <Sequence durationInFrames={msToFrame(timeline.footage.durationMs, fps)}>
                <AbsoluteFill style={{ overflow: 'hidden' }}>
                    <OffthreadVideo
                        src={props.footageUrl}
                        muted
                        style={{
                            position: 'absolute',
                            left: -originX * k,
                            top: -originY * k,
                            width: windowW * k,
                            height: windowH * k,
                        }}
                    />
                </AbsoluteFill>
            </Sequence>
            {props.voice.map((line) => (
                <Sequence key={line.beatId} from={msToFrame(beatStart(line.beatId), fps)}>
                    <Audio src={line.url} />
                </Sequence>
            ))}
            {overlay}
        </AbsoluteFill>
    );
}
