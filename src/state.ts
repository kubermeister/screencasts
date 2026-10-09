import { createHash, type Hash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { APP_DIR, ROOT, type Theme } from './config';
import { holdMs, videoDir, type Format, type Script } from './script';
import { variantFiles, type Variant } from './variant';

/**
 * What each stage of a video was last made from (PLAN.md section 7). A stage reruns only when one
 * of its keys differs from what it would be now.
 */
export interface State {
    /** The app's built out/: what was filmed. */
    app?: string;
    /** scene.ts, beat ids and holds, voice durations, theme, harness source: how it was filmed. */
    scene?: string;
    /** Each spoken line's cache key, by beat id. */
    voice?: Record<string, string>;
    /** Each format's render key: everything that changes a frame without changing the footage. */
    render?: Partial<Record<Format, string>>;
}

export function readState(variant: Variant): State {
    const path = variantFiles(variant).state;
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as State) : {};
}

export function writeState(variant: Variant, state: State): void {
    mkdirSync(variant.dir, { recursive: true });
    writeFileSync(variantFiles(variant).state, `${JSON.stringify(state, null, 2)}\n`);
}

/** Every file under `dir`, sorted, so a hash of them is the same whatever order the disk lists them in. */
function filesUnder(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name !== '.DS_Store')
        .map((entry) => join(entry.parentPath, entry.name))
        .sort();
}

/** Paths relative to `base` go into the hash with the bytes, so a rename changes it as an edit would. */
function hashFiles(hash: Hash, base: string, files: string[]): void {
    for (const file of files) {
        hash.update(`${relative(base, file)}\0`);
        hash.update(readFileSync(file));
        hash.update('\0');
    }
}

const digest = (hash: Hash) => hash.digest('hex');

export function appKey(): string {
    const out = join(APP_DIR, 'out');
    const hash = createHash('sha256');
    hashFiles(hash, out, filesUnder(out));
    return digest(hash);
}

export function sceneKey(script: Script, theme: Theme, voiceMs: ReadonlyMap<string, number>): string {
    const hash = createHash('sha256');
    hash.update(readFileSync(join(videoDir(script.id), 'scene.ts')));
    // Only what changes the filmed action and its timing: wording does not, so it stays out.
    hash.update(JSON.stringify(script.beats.map((beat) => [beat.id, holdMs(beat), voiceMs.get(beat.id) ?? null])));
    hash.update(theme);
    hashFiles(hash, ROOT, filesUnder(join(ROOT, 'src/harness')));
    return digest(hash);
}

/** The footage a render is made from is named by the two keys that made it. */
export function footageKey(state: State): string {
    return `${state.app ?? ''}:${state.scene ?? ''}`;
}

export function renderKey(
    script: Script,
    format: Format,
    theme: Theme,
    footage: string,
    voice: Record<string, string>,
): string {
    const hash = createHash('sha256');
    // What a frame shows, rather than the file: other voices listed beside this one change nothing here.
    hash.update(JSON.stringify({ title: script.title, beats: script.beats }));
    hash.update(`${format}\0${theme}\0${footage}\0${JSON.stringify(voice)}\0`);
    for (const dir of ['brand', 'src/render', 'src/remotion']) hashFiles(hash, ROOT, filesUnder(join(ROOT, dir)));
    return digest(hash);
}

export function outputsExist(variant: Variant, format: Format): boolean {
    const files = variantFiles(variant);
    return existsSync(files.video(format)) && existsSync(files.captions);
}

export function framesExist(variant: Variant, format: Format, beats: number): boolean {
    const dir = variantFiles(variant).frames;
    if (!existsSync(dir)) return false;
    const prefix = format === 'video' ? /^\d\d-/ : new RegExp(`^${format}-\\d\\d-`);
    return readdirSync(dir).filter((file) => prefix.test(file)).length >= beats;
}

export function footageExists(variant: Variant): boolean {
    const files = variantFiles(variant);
    return existsSync(files.footage) && existsSync(files.timeline) && statSync(files.footage).size > 0;
}
