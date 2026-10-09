import { AbsoluteFill, Img, staticFile } from 'remotion';
import type { Brand, Palette } from '../timing';

export function EndCard({
    value,
    title,
    opacity,
    brand,
    palette,
    fontSize,
}: {
    value: string;
    title: string;
    opacity: number;
    brand: Brand;
    palette: Palette;
    fontSize: number;
}) {
    return (
        <AbsoluteFill
            style={{
                opacity,
                backgroundColor: palette.background,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 36,
                fontFamily: brand.font.family,
                textAlign: 'center',
                padding: 80,
            }}
        >
            <Img src={staticFile('logo.svg')} style={{ width: 220, height: 220 }} />
            <div style={{ fontSize: fontSize * 0.7, fontWeight: 500, color: palette.muted }}>{title}</div>
            <div style={{ fontSize, fontWeight: 650, letterSpacing: '-0.015em', color: palette.text }}>{value}</div>
        </AbsoluteFill>
    );
}
