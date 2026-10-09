import type { CSSProperties } from 'react';
import type { Brand, Palette } from '../timing';

/** Text on a translucent panel, clamped to `maxLines` so it can never grow into the footage. */
export function Caption({
    value,
    opacity,
    brand,
    palette,
    fontSize,
    maxLines,
    style,
}: {
    value: string;
    opacity: number;
    brand: Brand;
    palette: Palette;
    fontSize: number;
    maxLines: number;
    style?: CSSProperties;
}) {
    return (
        <div
            style={{
                opacity,
                fontFamily: brand.font.family,
                fontSize,
                fontWeight: 560,
                lineHeight: 1.22,
                letterSpacing: '-0.01em',
                color: palette.text,
                backgroundColor: `${palette.surface}e6`,
                border: `2px solid ${palette.border}`,
                borderRadius: 22,
                padding: '22px 36px',
                boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
                textAlign: 'center',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: maxLines,
                overflow: 'hidden',
                ...style,
            }}
        >
            {value}
        </div>
    );
}
