import { useMemo, type CSSProperties } from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { EndCard } from './components/EndCard';
import { useBrandFont } from './fonts';
import {
    boxAt,
    cropAt,
    cropHeight,
    fadeOpacity,
    frameToMs,
    msToFrame,
    spanAt,
    textSpans,
    zoomSpans,
    type RenderProps,
} from './timing';

/**
 * 9:16 with vertical content: the words in one band at the top, and below them a portrait crop of
 * the window that follows what matters, the callout's element or the cursor. When the focus is wider
 * than a portrait crop, the crop widens to fit it and a blurred copy of itself fills the space left
 * above and below. No text is drawn above the band or below `visibleBottom`, where the platforms put
 * their own buttons and captions.
 */
export function Reel(props: RenderProps) {
    const { timeline, script, brand, theme } = props;
    useBrandFont(brand);
    const frame = useCurrentFrame();
    const { fps, width, durationInFrames } = useVideoConfig();
    const ms = frameToMs(frame, fps);
    const totalMs = frameToMs(durationInFrames, fps);
    const spans = useMemo(() => textSpans(timeline, script, totalMs), [timeline, script, totalMs]);
    const span = spanAt(spans, ms);
    const palette = brand.themes[theme];
    const reel = brand.reel;
    const opacity = span ? fadeOpacity(ms, span.startMs, span.endMs, brand.durations.fadeMs) : 0;

    const windowW = timeline.footage.width / timeline.scale;
    const windowH = timeline.footage.height / timeline.scale;
    const [stageTop, stageBottom] = reel.stage;
    const stageH = stageBottom - stageTop;
    const aspect = stageH / width;
    const zooms = useMemo(() => zoomSpans(timeline, script), [timeline, script]);
    const crop = cropAt(
        timeline,
        spans,
        ms,
        {
            minCropWidth: reel.minCropWidth,
            cursorCropWidth: reel.cursorCropWidth,
            anchorPadding: reel.anchorPadding,
            aspect,
            easeMs: brand.durations.zoomEaseMs,
        },
        zooms,
    );
    const cropH = cropHeight(crop.w, aspect, windowH);
    // CSS px of the window → frame px.
    const k = width / crop.w;
    const shownH = cropH * k;
    // A crop shorter than the stage sits in the part of it the platforms leave uncovered.
    const visibleH = reel.visibleBottom - stageTop;
    const top = shownH <= visibleH ? stageTop + (visibleH - shownH) / 2 : stageTop;
    // The blurred fill only has to cover the stage, from the same centre as the sharp crop.
    const fill = Math.max(k, stageH / cropH) * 1.15;
    const left = crop.cx - crop.w / 2;
    const upper = crop.cy - cropH / 2;
    const footage = (scale: number, style?: CSSProperties) => (
        <OffthreadVideo
            src={props.footageUrl}
            muted
            style={{ position: 'absolute', width: windowW * scale, height: windowH * scale, ...style }}
        />
    );

    const marker =
        span?.kind === 'callout' && span.anchor
            ? boxAt(timeline.anchors[span.anchor], ms, brand.durations.calloutFollowMs)
            : undefined;
    const text = span && span.kind !== 'end-card' ? span : undefined;

    return (
        <AbsoluteFill style={{ backgroundColor: palette.background, fontFamily: brand.font.family }}>
            <Sequence durationInFrames={msToFrame(timeline.footage.durationMs, fps)}>
                {shownH < stageH && (
                    // The crop again, enlarged to cover the stage, blurred and dimmed: no empty bars.
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: stageTop,
                            width,
                            height: stageH,
                            overflow: 'hidden',
                        }}
                    >
                        {footage(fill, {
                            left: width / 2 - crop.cx * fill,
                            top: stageH / 2 - crop.cy * fill,
                            filter: 'blur(36px) brightness(0.45) saturate(0.8)',
                        })}
                    </div>
                )}
                <div style={{ position: 'absolute', left: 0, top, width, height: shownH, overflow: 'hidden' }}>
                    {footage(k, { left: -left * k, top: -upper * k })}
                    {marker && (
                        <div
                            style={{
                                position: 'absolute',
                                left: (marker.x - left) * k - 10,
                                top: (marker.y - upper) * k - 10,
                                width: marker.w * k + 20,
                                height: marker.h * k + 20,
                                border: `6px solid ${palette.callout}`,
                                borderRadius: 16,
                                boxSizing: 'border-box',
                                opacity,
                            }}
                        />
                    )}
                </div>
            </Sequence>

            {text && (
                <AbsoluteFill
                    style={{
                        top: reel.textBand[0],
                        height: reel.textBand[1] - reel.textBand[0],
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: `0 ${reel.sideMargin}px`,
                    }}
                >
                    <div
                        style={{
                            opacity,
                            fontSize: text.kind === 'callout' ? brand.sizes.reelCallout : brand.sizes.reelText,
                            fontWeight: text.kind === 'title' ? 680 : 600,
                            lineHeight: 1.18,
                            letterSpacing: '-0.015em',
                            textAlign: 'center',
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 3,
                            overflow: 'hidden',
                            ...(text.kind === 'callout'
                                ? {
                                      color: palette.calloutText,
                                      backgroundColor: palette.callout,
                                      borderRadius: 24,
                                      padding: '26px 36px',
                                  }
                                : { color: palette.text }),
                        }}
                    >
                        {text.value}
                    </div>
                </AbsoluteFill>
            )}

            {props.voice.map((line) => (
                <Sequence
                    key={line.beatId}
                    from={msToFrame(timeline.beats.find((beat) => beat.id === line.beatId)?.startMs ?? 0, fps)}
                >
                    <Audio src={line.url} />
                </Sequence>
            ))}

            {span?.kind === 'end-card' && (
                <EndCard
                    value={span.value}
                    brand={brand}
                    palette={palette}
                    fontSize={brand.sizes.endCard}
                    opacity={fadeOpacity(ms, span.startMs, span.endMs, brand.durations.fadeMs, false)}
                />
            )}
        </AbsoluteFill>
    );
}
