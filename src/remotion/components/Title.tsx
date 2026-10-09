import { AbsoluteFill } from 'remotion';
import type { Brand } from '../timing';

/** Centred over a dark scrim; the scrim keeps the text readable whatever the footage shows. */
export function Title({ value, opacity, brand }: { value: string; opacity: number; brand: Brand }) {
    return (
        <AbsoluteFill style={{ opacity }}>
            <AbsoluteFill style={{ backgroundColor: `rgba(0, 0, 0, ${brand.video.scrimOpacity})` }} />
            <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 160 }}>
                <div
                    style={{
                        fontFamily: brand.font.family,
                        fontSize: brand.sizes.title,
                        fontWeight: 650,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.12,
                        color: '#ffffff',
                        textAlign: 'center',
                        textShadow: '0 2px 24px rgba(0, 0, 0, 0.45)',
                        maxWidth: 1500,
                    }}
                >
                    {value}
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
}
