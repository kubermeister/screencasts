import { useMemo } from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Callout } from './components/Callout';
import { Caption } from './components/Caption';
import { EndCard } from './components/EndCard';
import { Title } from './components/Title';
import { useBrandFont } from './fonts';
import { estimateLabel, layoutCallout } from './layout';
import { boxAt, fadeOpacity, frameToMs, msToFrame, spanAt, textSpans, type RenderProps } from './timing';

const CALLOUT_MAX_WIDTH = 640;
const CALLOUT_PADDING = 26;

/** 16:9: the footage fills the frame and the text sits over it. */
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
    // Timeline boxes are CSS px of the recorded window; the frame is wider than the window.
    const cssToFrame = width / (timeline.footage.width / timeline.scale);
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
            const anchor = {
                x: css.x * cssToFrame,
                y: css.y * cssToFrame,
                w: css.w * cssToFrame,
                h: css.h * cssToFrame,
            };
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
                <OffthreadVideo src={props.footageUrl} muted style={{ width, height }} />
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
