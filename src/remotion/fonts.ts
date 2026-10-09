import { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';
import type { Brand } from './timing';

/** Holds the render until the brand font is loaded, so no frame is drawn in a fallback face. */
export function useBrandFont(brand: Brand): void {
    const [handle] = useState(() => delayRender(`font ${brand.font.family}`));
    useEffect(() => {
        const faces = brand.font.files.map(
            (file) =>
                new FontFace(brand.font.family, `url(${staticFile(file)}) format('woff2')`, { weight: '100 900' }),
        );
        Promise.all(faces.map((face) => face.load()))
            .then((loaded) => {
                loaded.forEach((face) => document.fonts.add(face));
                continueRender(handle);
            })
            .catch((error: unknown) => cancelRender(error));
    }, [brand, handle]);
}
