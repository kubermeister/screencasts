// Follows the app's tests/demo/harness/launch.ts (settings file, environment, theme switch) and the
// chart repository of tests/demo/shots/screenshots.test.ts.
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import semver from 'semver';
import { APP_DIR, FOOTAGE, ROOT, SCALE, WINDOW, type Theme } from '../config';
import { CHART_PATH, CONTEXT_NAME, hasHelm, KUBECONFIG_PATH, NAMESPACE } from './cluster';
import { answerChartsWith } from './history';

/** A failure whose message is the whole story, including the fix; the CLI prints it as is. */
export class PreflightError extends Error {}

interface AppPackage {
    name?: string;
    version?: string;
}

function readJson<T>(path: string): T {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/** The newest modification time of any file under `dir`, in ms. */
function newestMtime(dir: string): number {
    let newest = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
        if (!entry.isFile()) continue;
        newest = Math.max(newest, statSync(join(entry.parentPath, entry.name)).mtimeMs);
    }
    return newest;
}

export function appVersion(): string {
    return readJson<AppPackage>(join(APP_DIR, 'package.json')).version ?? '0.0.0';
}

/**
 * Checks 1–3 of the pre-flight: the checkout is the app, it is built from its current sources, and it
 * is recent enough to have the feature. Each failure names the fix.
 */
export function checkApp(feature?: { id: string; since: string }): void {
    const pkgPath = join(APP_DIR, 'package.json');
    if (!existsSync(pkgPath) || readJson<AppPackage>(pkgPath).name !== 'kubermeister') {
        throw new PreflightError(
            `No Kubermeister checkout at ${APP_DIR}. Clone github.com/kubermeister/kubermeister there, ` +
                'or set KUBERMEISTER_APP to the absolute path of one.',
        );
    }

    const entry = join(APP_DIR, 'out/main/index.mjs');
    // Filming a build older than its sources shows a version of the app nobody can check out.
    if (!existsSync(entry) || statSync(entry).mtimeMs < newestMtime(join(APP_DIR, 'src'))) {
        throw new PreflightError(
            `The app build is missing or older than its sources. Run \`npm run build\` in ${APP_DIR}`,
        );
    }

    if (feature) {
        const version = appVersion();
        if (semver.lt(version, feature.since)) {
            throw new PreflightError(
                `This checkout of the app (v${version}) predates ${feature.id} (since v${feature.since}). ` +
                    'Check out a later version',
            );
        }
    }
}

/**
 * Two Playwright versions drive Electron differently; a harness older than the one the app's own
 * suites use may not speak to the Electron the app ships. A warning, since it usually still works.
 */
export function warnOnOldPlaywright(): void {
    const appPlaywright = join(APP_DIR, 'node_modules/@playwright/test/package.json');
    if (!existsSync(appPlaywright)) return;
    const theirs = readJson<AppPackage>(appPlaywright).version;
    const ours = readJson<AppPackage>(join(ROOT, 'node_modules/playwright/package.json')).version;
    if (theirs && ours && semver.lt(ours, theirs)) {
        console.warn(`[app] playwright ${ours} is older than the app's @playwright/test ${theirs}; update it here`);
    }
}

function electronBinary(): string {
    // The `electron` package's default export is the path of the binary it downloaded.
    const binary: unknown = createRequire(join(APP_DIR, 'package.json'))('electron');
    if (typeof binary !== 'string' || !existsSync(binary)) {
        throw new PreflightError(`Electron is not installed in ${APP_DIR}. Run \`npm ci\` there`);
    }
    return binary;
}

/** The repository and chart the chart screens list. */
export const CHART_REPOSITORY = 'platform';

interface ChartRepository {
    url: string;
    close(): Promise<void>;
}

/**
 * A classic repository serving the demo's own chart, packaged and indexed by the real Helm, so the
 * chart screens show a chart the app actually fetched.
 */
async function serveChartRepository(): Promise<ChartRepository> {
    const dir = mkdtempSync(join(tmpdir(), 'km-screencasts-charts-'));
    const server: Server = createServer((request, response) => {
        const file = join(dir, (request.url ?? '/').split('?')[0]!.replace(/^\/+/, ''));
        if (!file.startsWith(dir) || !existsSync(file)) {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200);
        createReadStream(file).pipe(response);
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Helm's own config and cache are kept out of the developer's home.
    const env = {
        PATH: process.env.PATH,
        HOME: dir,
        HELM_CACHE_HOME: join(dir, '.helm'),
        HELM_CONFIG_HOME: join(dir, '.helm'),
    };
    execFileSync('helm', ['package', CHART_PATH, '--destination', dir], { env });
    execFileSync('helm', ['repo', 'index', dir, '--url', url], { env });
    return {
        url,
        close: async () => {
            await new Promise((done) => server.close(done));
            rmSync(dir, { recursive: true, force: true });
        },
    };
}

export interface LaunchedApp {
    app: ElectronApplication;
    window: Page;
    userData: string;
    close(): Promise<void>;
}

const SHELL_TIMEOUT_MS = 60_000;

async function waitForShell(window: Page): Promise<void> {
    await window.waitForLoadState('domcontentloaded');
    await window.getByTestId('app-shell').waitFor({ timeout: SHELL_TIMEOUT_MS });
}

interface SettingsFileStatus {
    blocked: boolean;
    readOnly: string | null;
    problems: { path: string; message: string }[];
}

/**
 * The app runs on its defaults rather than fail when it cannot use a key of the file, and on its
 * defaults the window would be the wrong size and the cluster the wrong one. Its own report of the
 * file, plus the window it actually opened, tell a schema change from a harness bug.
 */
async function checkSettingsTaken(window: Page): Promise<void> {
    const status = await window.evaluate(async () => {
        const bridge = (globalThis as unknown as { km: { invoke(channel: string, input?: unknown): Promise<unknown> } })
            .km;
        return bridge.invoke('settingsFile.status', {});
    });
    const envelope = status as { ok: boolean; data?: SettingsFileStatus };
    const problems: string[] = [];
    if (!envelope.ok || !envelope.data) problems.push(`settingsFile.status answered ${JSON.stringify(status)}`);
    else {
        if (envelope.data.blocked) problems.push(envelope.data.readOnly ?? 'the app will not use the file');
        problems.push(...envelope.data.problems.map((problem) => `${problem.path}: ${problem.message}`));
    }
    // Only the width: the bounds are the outer frame, so the height also holds the title bar.
    const width = await window.evaluate(() => globalThis.innerWidth);
    if (width !== WINDOW.width) problems.push(`the window opened ${width} px wide, not ${WINDOW.width}`);
    if (problems.length > 0) {
        throw new Error(
            `The app's settings schema changed; update src/harness/app.ts. The app said: ${problems.join('; ')}`,
        );
    }
}

/**
 * `window.bounds` is the outer frame, title bar included, whose height differs between macOS
 * versions. The page itself must be exactly 16:9 for the footage to fill the frame, so the content
 * is sized from main, the way history.ts reaches it, rather than by guessing the title bar.
 */
async function sizeContent(app: ElectronApplication, window: Page): Promise<void> {
    await app.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height);
    }, WINDOW);
    await window.waitForFunction(
        (size) => globalThis.innerWidth === size.width && globalThis.innerHeight === size.height,
        WINDOW,
        { timeout: 5_000 },
    );
    const scale = await window.evaluate(() => globalThis.devicePixelRatio);
    if (scale !== SCALE) {
        throw new PreflightError(
            `The window renders at ${scale}x, not ${SCALE}x: record on a Retina display, or the footage is not ` +
                `${FOOTAGE.width}×${FOOTAGE.height}`,
        );
    }
}

/**
 * The theme is renderer `localStorage`, read as the theme provider mounts, so it is written and the
 * window reloaded. A reload leaves main alone, so the chart history injected there survives it.
 */
export async function setTheme(window: Page, theme: Theme): Promise<void> {
    await window.evaluate((value) => localStorage.setItem('km-theme', value), theme);
    await window.reload();
    await waitForShell(window);
}

export async function launch({ theme }: { theme: Theme }): Promise<LaunchedApp> {
    const charts = hasHelm() ? await serveChartRepository() : undefined;
    const userData = mkdtempSync(join(tmpdir(), 'km-screencasts-'));
    writeFileSync(
        join(userData, 'settings.json'),
        JSON.stringify({
            version: 1,
            session: { lastContext: CONTEXT_NAME, lastNamespace: NAMESPACE, restoreOnLaunch: true },
            connection: { kubeconfigPath: KUBECONFIG_PATH },
            // An "Update available" pill would leak into the video, and lists that move read better
            // than still ones, so the refresh cadence is the quickest one Settings offers.
            updates: { mode: 'off', checkIntervalHours: 4 },
            data: { refreshIntervalSec: 5, readTimeoutSec: 60, logBufferLines: 2_000, terminalFontSize: 13 },
            window: { bounds: WINDOW },
            ...(charts && {
                charts: { repositories: [{ name: CHART_REPOSITORY, url: charts.url, kind: 'classic' }] },
            }),
        }),
    );

    const cleanUp = async () => {
        rmSync(userData, { recursive: true, force: true });
        await charts?.close();
    };

    let app: ElectronApplication;
    try {
        app = await electron.launch({
            executablePath: electronBinary(),
            args: [
                join(APP_DIR, 'out/main/index.mjs'),
                // A covered or unfocused window must keep painting: the recording is of the renderer,
                // and Chromium otherwise stops producing frames for a window nobody can see.
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--disable-background-timer-throttling',
            ],
            cwd: APP_DIR,
            env: {
                ...process.env,
                KUBERMEISTER_USER_DATA: userData,
                KUBECONFIG: KUBECONFIG_PATH,
                // Never steal focus: a recording takes minutes and the maintainer keeps working.
                KUBERMEISTER_SHOW_INACTIVE: '1',
                // The log console shows times in the viewer's zone; a published video shows UTC.
                TZ: 'UTC',
            },
        });
    } catch (error) {
        await cleanUp();
        throw error;
    }

    const close = async () => {
        await app.close().catch(() => undefined);
        await cleanUp();
    };

    try {
        const window = await app.firstWindow();
        // tsx compiles with esbuild's keepNames, which wraps every named function in a `__name` call.
        // Callbacks passed to `evaluate` are serialized and run where that helper does not exist, so
        // it is defined as a no-op in main and in every page the window loads.
        const NAME_SHIM = 'globalThis.__name ??= (fn) => fn;';
        await app.evaluate(NAME_SHIM);
        await window.addInitScript(NAME_SHIM);
        await window.evaluate(NAME_SHIM);
        await waitForShell(window);
        await checkSettingsTaken(window);
        await sizeContent(app, window);
        // Before the theme's reload, so the charts' first read after it already gets the injected history.
        await answerChartsWith(app);
        await setTheme(window, theme);
        return { app, window, userData, close };
    } catch (error) {
        await close();
        throw error;
    }
}
