import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SHELL_DIR = /^chromium_headless_shell-(\d+)$/;

/** Where Playwright keeps its browsers, by its own rules. */
export function playwrightCacheDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
    if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== '0') return env.PLAYWRIGHT_BROWSERS_PATH;
    if (platform === 'darwin') return join(homedir(), 'Library/Caches/ms-playwright');
    if (platform === 'win32') return join(env.LOCALAPPDATA ?? join(homedir(), 'AppData/Local'), 'ms-playwright');
    return join(env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'ms-playwright');
}

/** The executable inside one installed headless shell, whatever platform folder it sits in. */
function shellIn(dir: string): string | undefined {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith('chrome-headless-shell-')) continue;
        for (const name of ['chrome-headless-shell', 'chrome-headless-shell.exe']) {
            const file = join(dir, entry.name, name);
            if (existsSync(file)) return file;
        }
    }
    return undefined;
}

/** The newest chrome-headless-shell Playwright has installed, or undefined when there is none. */
export function newestPlaywrightShell(cacheDir: string): string | undefined {
    if (!existsSync(cacheDir)) return undefined;
    const installs = readdirSync(cacheDir)
        .map((name) => ({ name, revision: Number(SHELL_DIR.exec(name)?.[1]) }))
        .filter((install) => Number.isFinite(install.revision))
        .sort((a, b) => b.revision - a.revision);
    for (const install of installs) {
        const shell = shellIn(join(cacheDir, install.name));
        if (shell) return shell;
    }
    return undefined;
}

/**
 * The browser Remotion renders with. Remotion downloads its own Chrome Headless Shell on first use,
 * from a host some networks cannot reach, and then hangs on it; Playwright's is the same browser from
 * a host this repository already depends on. Order: `KM_SCREENCASTS_BROWSER`, then the newest
 * Playwright install, then null, which leaves Remotion to download its own.
 */
export function renderBrowser(env: NodeJS.ProcessEnv = process.env, cacheDir = playwrightCacheDir(env)): string | null {
    if (env.KM_SCREENCASTS_BROWSER) return env.KM_SCREENCASTS_BROWSER;
    return newestPlaywrightShell(cacheDir) ?? null;
}
