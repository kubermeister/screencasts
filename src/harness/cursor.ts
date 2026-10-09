import type { Page } from 'playwright';

/**
 * Playwright's mouse leaves no system cursor in a recording, so the page draws its own: an arrow that
 * follows `mousemove` and a ring that pulses on `mousedown`. It runs as an init script, so it comes
 * back after every reload or navigation, and is idempotent so the immediate call can run beside it.
 * Kept as a string: it runs in the renderer, never in Node.
 */
const CURSOR_SCRIPT = `(() => {
    const ID = 'km-screencasts-cursor';
    const install = () => {
        if (document.getElementById(ID)) return;
        const cursor = document.createElement('div');
        cursor.id = ID;
        cursor.setAttribute('aria-hidden', 'true');
        Object.assign(cursor.style, {
            position: 'fixed', left: '0', top: '0', width: '0', height: '0',
            pointerEvents: 'none', zIndex: '2147483647',
            transform: 'translate(' + (globalThis.__kmCursorX ?? innerWidth / 2) + 'px,' + (globalThis.__kmCursorY ?? innerHeight / 2) + 'px)',
        });
        cursor.innerHTML =
            '<svg width="22" height="28" viewBox="0 0 22 28" style="position:absolute;left:-2px;top:-2px;overflow:visible;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">' +
            '<path d="M2 2 L2 22 L7.5 17 L11 25.5 L14.5 24 L11 15.8 L18.5 15.8 Z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/>' +
            '</svg>';
        document.documentElement.appendChild(cursor);

        addEventListener('mousemove', (event) => {
            globalThis.__kmCursorX = event.clientX;
            globalThis.__kmCursorY = event.clientY;
            cursor.style.transform = 'translate(' + event.clientX + 'px,' + event.clientY + 'px)';
        }, { capture: true, passive: true });

        addEventListener('mousedown', (event) => {
            const ring = document.createElement('div');
            Object.assign(ring.style, {
                position: 'fixed', left: (event.clientX - 14) + 'px', top: (event.clientY - 14) + 'px',
                width: '28px', height: '28px', borderRadius: '50%', boxSizing: 'border-box',
                border: '2.5px solid rgba(255,255,255,.95)', boxShadow: '0 0 0 1.5px rgba(17,17,17,.6)',
                pointerEvents: 'none', zIndex: '2147483646',
            });
            document.documentElement.appendChild(ring);
            ring.animate(
                [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.8)', opacity: 0 }],
                { duration: 400, easing: 'ease-out', fill: 'forwards' },
            ).finished.then(() => ring.remove());
        }, { capture: true, passive: true });
    };
    if (document.documentElement) install();
    else addEventListener('DOMContentLoaded', install, { once: true });
})();`;

export async function injectCursor(window: Page): Promise<void> {
    await window.addInitScript(CURSOR_SCRIPT);
    await window.evaluate(CURSOR_SCRIPT);
}
