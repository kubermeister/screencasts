import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { newestPlaywrightShell, playwrightCacheDir, renderBrowser } from '../src/render/browser';

const dirs: string[] = [];

/** A fake Playwright cache holding a headless shell at each of the given revisions. */
function cache(...revisions: number[]): string {
    const dir = mkdtempSync(join(tmpdir(), 'km-pw-'));
    dirs.push(dir);
    for (const revision of revisions) {
        const shellDir = join(dir, `chromium_headless_shell-${revision}`, 'chrome-headless-shell-mac-arm64');
        mkdirSync(shellDir, { recursive: true });
        writeFileSync(join(shellDir, 'chrome-headless-shell'), '');
    }
    mkdirSync(join(dir, 'chromium-9999'));
    return dir;
}

afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('renderBrowser', () => {
    it('takes KM_SCREENCASTS_BROWSER over anything installed', () => {
        expect(renderBrowser({ KM_SCREENCASTS_BROWSER: '/opt/shell' }, cache(1248))).toBe('/opt/shell');
    });

    it('finds the newest Playwright headless shell, by revision rather than by name', () => {
        const dir = cache(1181, 1248, 999);
        expect(renderBrowser({}, dir)).toBe(
            join(dir, 'chromium_headless_shell-1248', 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
        );
    });

    it('skips an install whose executable is missing', () => {
        const dir = cache(1181);
        mkdirSync(join(dir, 'chromium_headless_shell-1300'));
        expect(newestPlaywrightShell(dir)).toContain('chromium_headless_shell-1181');
    });

    it('leaves Remotion to download its own when nothing is installed', () => {
        expect(renderBrowser({}, cache())).toBeNull();
        expect(renderBrowser({}, join(tmpdir(), 'km-pw-missing'))).toBeNull();
    });
});

describe('playwrightCacheDir', () => {
    it('honours PLAYWRIGHT_BROWSERS_PATH', () => {
        expect(playwrightCacheDir({ PLAYWRIGHT_BROWSERS_PATH: '/srv/pw' }, 'darwin')).toBe('/srv/pw');
    });

    it('uses the platform default otherwise', () => {
        expect(playwrightCacheDir({}, 'darwin')).toMatch(/Library\/Caches\/ms-playwright$/);
        expect(playwrightCacheDir({ XDG_CACHE_HOME: '/xdg' }, 'linux')).toBe('/xdg/ms-playwright');
    });
});
