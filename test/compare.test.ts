import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { diffPercent } from '../src/compare';

/** A 10×10 grey image with the first `changed` pixels painted white. */
function png(changed = 0, width = 10): Buffer {
    const image = new PNG({ width, height: 10 });
    for (let i = 0; i < width * 10; i++) {
        const value = i < changed ? 255 : 40;
        image.data.set([value, value, value, 255], i * 4);
    }
    return PNG.sync.write(image);
}

describe('diffPercent', () => {
    it('is 0 for identical frames', () => {
        expect(diffPercent(png(), png())).toBe(0);
    });

    it('is the share of pixels that differ', () => {
        expect(diffPercent(png(), png(3))).toBe(3);
        expect(diffPercent(png(), png(50))).toBe(50);
    });

    it('treats frames of different sizes as entirely different', () => {
        expect(diffPercent(png(), png(0, 12))).toBe(100);
    });
});
