// Callout geometry, pure so it can be unit-tested and shared by the browser bundle.
import type { CalloutSide } from '../script';
import type { Box } from '../timeline';

export interface Size {
    w: number;
    h: number;
}

export interface CalloutLayout {
    side: Exclude<CalloutSide, 'auto'>;
    label: Box;
    /** From the label's edge to the anchor's edge; the arrowhead is drawn at `to`. */
    arrow: { from: { x: number; y: number }; to: { x: number; y: number } };
}

/** The label's size before it is rendered: wrapped at `maxWidth`, Geist at ~0.53 em per character. */
export function estimateLabel(text: string, fontSize: number, maxWidth: number, padding: number): Size {
    const perLine = Math.max(1, Math.floor((maxWidth - 2 * padding) / (fontSize * 0.53)));
    const lines = Math.ceil(text.length / perLine);
    const textWidth = Math.min(text.length, perLine) * fontSize * 0.53;
    return { w: Math.round(textWidth + 2 * padding), h: Math.round(lines * fontSize * 1.25 + 2 * padding) };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Puts a label beside the anchor box with an arrow between them. `auto` takes the side with the
 * most room relative to what the label needs there, so a wide label prefers above or below.
 */
export function layoutCallout(
    anchor: Box,
    label: Size,
    frame: Size,
    side: CalloutSide,
    { gap = 72, margin = 32 } = {},
): CalloutLayout {
    const room = {
        above: anchor.y - margin,
        below: frame.h - (anchor.y + anchor.h) - margin,
        left: anchor.x - margin,
        right: frame.w - (anchor.x + anchor.w) - margin,
    };
    const need = { above: label.h + gap, below: label.h + gap, left: label.w + gap, right: label.w + gap };
    const chosen: CalloutLayout['side'] =
        side !== 'auto'
            ? side
            : (Object.keys(room) as CalloutLayout['side'][]).reduce((best, candidate) =>
                  room[candidate] / need[candidate] > room[best] / need[best] ? candidate : best,
              );

    const cx = anchor.x + anchor.w / 2;
    const cy = anchor.y + anchor.h / 2;
    let x: number;
    let y: number;
    switch (chosen) {
        case 'above':
            x = cx - label.w / 2;
            y = anchor.y - gap - label.h;
            break;
        case 'below':
            x = cx - label.w / 2;
            y = anchor.y + anchor.h + gap;
            break;
        case 'left':
            x = anchor.x - gap - label.w;
            y = cy - label.h / 2;
            break;
        case 'right':
            x = anchor.x + anchor.w + gap;
            y = cy - label.h / 2;
            break;
    }
    x = clamp(x, margin, frame.w - margin - label.w);
    y = clamp(y, margin, frame.h - margin - label.h);
    const box = { x, y, w: label.w, h: label.h };

    // The arrow points at the anchor's centre line, kept within the label's edge: the label is
    // centred on the anchor and only shifted to stay inside the frame.
    const arrowX = clamp(cx, x + 24, x + label.w - 24);
    const arrowY = clamp(cy, y + 16, y + label.h - 16);
    const arrow = {
        above: { from: { x: arrowX, y: y + label.h }, to: { x: arrowX, y: anchor.y - 10 } },
        below: { from: { x: arrowX, y }, to: { x: arrowX, y: anchor.y + anchor.h + 10 } },
        left: { from: { x: x + label.w, y: arrowY }, to: { x: anchor.x - 10, y: arrowY } },
        right: { from: { x, y: arrowY }, to: { x: anchor.x + anchor.w + 10, y: arrowY } },
    }[chosen];
    return { side: chosen, label: box, arrow };
}
