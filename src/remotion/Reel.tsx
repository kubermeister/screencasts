import { useMemo } from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { EndCard } from './components/EndCard';
import { useBrandFont } from './fonts';
import { boxAt, fadeOpacity, frameToMs, msToFrame, spanAt, textSpans, viewportAt, type RenderProps } from './timing';

/**
 * 9:16, stacked: text in a top band, the footage in a 16:9 panel that zooms in on what matters, the
 * callout's words in a bottom band. Nothing is drawn above the top band or below the bottom one,
 * where the platforms put their own buttons and captions.
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
    const fade = brand.durations.fadeMs;
    const opacity = span ? fadeOpacity(ms, span.startMs, span.endMs, fade) : 0;

    const windowW = timeline.footage.width / timeline.scale;
    const windowH = timeline.footage.height / timeline.scale;
    const panelTop = reel.panel[0];
    const panelH = reel.panel[1] - reel.panel[0];
    const view = viewportAt(timeline, spans, ms, {
        maxZoomCallout: reel.maxZoomCallout,
        maxZoomCursor: reel.maxZoomCursor,
        easeMs: brand.durations.zoomEaseMs,
    });
    // CSS px of the window → px of the panel at the current zoom and pan.
    const k = (width / windowW) * view.zoom;
    const toPanel = (x: number, y: number) => ({ x: (x - view.cx) * k + width / 2, y: (y - view.cy) * k + panelH / 2 });
    const origin = toPanel(0, 0);

    const marker =
        span?.kind === 'callout' && span.anchor
            ? boxAt(timeline.anchors[span.anchor], ms, brand.durations.calloutFollowMs)
            : undefined;
    const markerAt = marker && toPanel(marker.x, marker.y);

    const topText = span && (span.kind === 'title' || span.kind === 'caption') ? span : undefined;
    const bottomText = span?.kind === 'callout' ? span : undefined;
    const band = (range: [number, number]) => ({ top: range[0], height: range[1] - range[0] });

    return (
        <AbsoluteFill style={{ backgroundColor: palette.background, fontFamily: brand.font.family }}>
            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    top: panelTop,
                    width,
                    height: panelH,
                    overflow: 'hidden',
                    borderTop: `2px solid ${palette.border}`,
                    borderBottom: `2px solid ${palette.border}`,
                }}
            >
                <Sequence durationInFrames={msToFrame(timeline.footage.durationMs, fps)}>
                    <OffthreadVideo
                        src={props.footageUrl}
                        muted
                        style={{
                            position: 'absolute',
                            left: origin.x,
                            top: origin.y,
                            width: windowW * k,
                            height: windowH * k,
                        }}
                    />
                </Sequence>
                {marker && markerAt && (
                    <div
                        style={{
                            position: 'absolute',
                            left: markerAt.x - 10,
                            top: markerAt.y - 10,
                            width: marker.w * k + 20,
                            height: marker.h * k + 20,
                            border: `5px solid ${palette.callout}`,
                            borderRadius: 14,
                            boxSizing: 'border-box',
                            opacity,
                        }}
                    />
                )}
            </div>

            {topText && (
                <AbsoluteFill
                    style={{
                        ...band(reel.topBand),
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: `0 ${reel.sideMargin}px`,
                    }}
                >
                    <div
                        style={{
                            opacity,
                            fontSize: brand.sizes.reelText,
                            fontWeight: topText.kind === 'title' ? 680 : 580,
                            lineHeight: 1.18,
                            letterSpacing: '-0.015em',
                            color: palette.text,
                            textAlign: 'center',
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 3,
                            overflow: 'hidden',
                        }}
                    >
                        {topText.value}
                    </div>
                </AbsoluteFill>
            )}

            {bottomText && (
                <AbsoluteFill
                    style={{
                        ...band(reel.bottomBand),
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: `0 ${reel.sideMargin}px`,
                    }}
                >
                    <div
                        style={{
                            opacity,
                            fontSize: brand.sizes.reelCallout,
                            fontWeight: 600,
                            lineHeight: 1.22,
                            color: palette.calloutText,
                            backgroundColor: palette.callout,
                            borderRadius: 24,
                            padding: '26px 36px',
                            textAlign: 'center',
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 3,
                            overflow: 'hidden',
                        }}
                    >
                        {bottomText.value}
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
                    title={script.title}
                    brand={brand}
                    palette={palette}
                    fontSize={brand.sizes.endCard}
                    opacity={fadeOpacity(ms, span.startMs, span.endMs, fade, false)}
                />
            )}
        </AbsoluteFill>
    );
}
