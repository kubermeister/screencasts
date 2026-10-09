import { AbsoluteFill } from 'remotion';
import type { CalloutLayout } from '../layout';
import type { Box } from '../../timeline';
import type { Brand, Palette } from '../timing';

/** A rounded label, an arrow to the element, and a ring around it; all in frame px. */
export function Callout({
    value,
    anchor,
    layout,
    opacity,
    brand,
    palette,
    fontSize,
}: {
    value: string;
    anchor: Box;
    layout: CalloutLayout;
    opacity: number;
    brand: Brand;
    palette: Palette;
    fontSize: number;
}) {
    const { from, to } = layout.arrow;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const head = 18;
    const wing = (offset: number) =>
        `${to.x - head * Math.cos(angle + offset)},${to.y - head * Math.sin(angle + offset)}`;
    return (
        <AbsoluteFill style={{ opacity }}>
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                <rect
                    x={anchor.x - 8}
                    y={anchor.y - 8}
                    width={anchor.w + 16}
                    height={anchor.h + 16}
                    rx={14}
                    fill="none"
                    stroke={palette.callout}
                    strokeWidth={5}
                />
                <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={palette.callout}
                    strokeWidth={5}
                    strokeLinecap="round"
                />
                <polygon points={`${to.x},${to.y} ${wing(0.45)} ${wing(-0.45)}`} fill={palette.callout} />
            </svg>
            <div
                style={{
                    position: 'absolute',
                    left: layout.label.x,
                    top: layout.label.y,
                    width: layout.label.w,
                    minHeight: layout.label.h,
                    boxSizing: 'border-box',
                    padding: '18px 26px',
                    borderRadius: 18,
                    backgroundColor: palette.callout,
                    color: palette.calloutText,
                    fontFamily: brand.font.family,
                    fontSize,
                    fontWeight: 600,
                    lineHeight: 1.25,
                    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
                    textAlign: 'center',
                }}
            >
                {value}
            </div>
        </AbsoluteFill>
    );
}
