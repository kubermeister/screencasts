import { AbsoluteFill, Img, staticFile } from 'remotion';
import type { Brand, Palette } from '../timing';

/** The logo and the website, and nothing tying the video to a release. */
export function EndCard({
    value,
    opacity,
    brand,
    palette,
    fontSize,
}: {
    value: string;
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
                gap: 48,
                fontFamily: brand.font.family,
                textAlign: 'center',
                padding: 80,
            }}
        >
            <Img src={staticFile('logo.svg')} style={{ width: 240, height: 240 }} />
            <div style={{ fontSize, fontWeight: 650, letterSpacing: '-0.015em', color: palette.text }}>{value}</div>
        </AbsoluteFill>
    );
}
