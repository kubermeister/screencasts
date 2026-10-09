import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OUT_DIR, type Theme } from './config';
import type { Format, Script, VoiceSettings } from './script';
import type { Fetch } from './voice/provider';

/**
 * One rendering of a video: its theme and one of its voices. Each variant has its own folder, so
 * variants sit side by side and switching back to one already made costs nothing; every file name
 * repeats the variant, so a file still says what it is once it leaves its folder.
 */
export interface Variant {
    id: string;
    theme: Theme;
    /** Absent for a silent video. */
    voice: VoiceSettings | undefined;
    /** What the voice is, readably: `silent`, `kokoro-af-heart`, `elevenlabs-v4-female-option-1`. */
    label: string;
    /** `<theme>--<label>`: the folder's name and the tail of every file name. */
    name: string;
    dir: string;
}

export function slugify(text: string): string {
    return text
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** The model as people say it: `eleven_v4` → `v4`, `eleven_multilingual_v2` → `multilingual-v2`. */
function modelLabel(model: string | null | undefined): string | undefined {
    return model ? slugify(model.replace(/^eleven_/, '')) : undefined;
}

/**
 * A voice's readable label. `name` is the voice's own name where the provider has one (ElevenLabs
 * ids say nothing); speed and OpenAI instructions are added only when they differ from the default,
 * so two voices that sound different never share a label.
 */
export function voiceLabel(voice: VoiceSettings | undefined, name?: string): string {
    if (!voice) return 'silent';
    const parts = [
        voice.provider,
        modelLabel(voice.provider === 'kokoro' ? undefined : voice.model),
        slugify(name ?? voice.voice),
    ];
    if (voice.speed !== undefined && voice.speed !== 1) parts.push(`speed-${voice.speed}`);
    if (voice.instructions)
        parts.push(`tone-${createHash('sha256').update(voice.instructions).digest('hex').slice(0, 6)}`);
    return parts.filter((part) => part !== undefined && part !== '').join('-');
}

export function variantOf(id: string, theme: Theme, voice: VoiceSettings | undefined, voiceName?: string): Variant {
    const label = voiceLabel(voice, voiceName);
    const name = `${theme}--${label}`;
    return { id, theme, voice, label, name, dir: join(OUT_DIR, id, name) };
}

/** Where everything of a variant lives. */
export const variantFiles = (variant: Variant) => ({
    video: (format: Format) => join(variant.dir, `${variant.id}--${format}--${variant.name}.mp4`),
    captions: join(variant.dir, `${variant.id}--${variant.name}.vtt`),
    frames: join(variant.dir, 'frames'),
    framesPrevious: join(variant.dir, 'frames-previous'),
    footage: join(variant.dir, 'footage.mp4'),
    timeline: join(variant.dir, 'timeline.json'),
    state: join(variant.dir, 'state.json'),
});

/** The voices a script declares, the default first; one `undefined` for a silent script. */
export function voicesOf(script: Pick<Script, 'voice' | 'voices'>): (VoiceSettings | undefined)[] {
    return script.voices ?? [script.voice];
}

const NAMES_PATH = join(OUT_DIR, 'voice', 'names.json');

function savedNames(path: string): Record<string, string> {
    try {
        return JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
    } catch {
        return {};
    }
}

/**
 * A voice's own name, for its label. ElevenLabs is asked every run, so renaming a voice there renames
 * its variants; the last answer is kept for when it cannot be reached, and with none the id is used.
 * A name never stops a render.
 */
export async function voiceName(
    voice: VoiceSettings | undefined,
    fetchImpl: Fetch = fetch,
    namesPath = NAMES_PATH,
): Promise<string | undefined> {
    if (voice?.provider !== 'elevenlabs') return voice?.voice;
    const saved = savedNames(namesPath);
    try {
        const key = process.env.ELEVENLABS_API_KEY;
        if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
        const response = await fetchImpl(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voice.voice)}`, {
            headers: { 'xi-api-key': key },
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`ElevenLabs answered ${response.status}`);
        const { name } = (await response.json()) as { name?: unknown };
        if (typeof name !== 'string' || name.trim() === '') throw new Error('ElevenLabs returned no name');
        if (saved[voice.voice] !== name) {
            mkdirSync(dirname(namesPath), { recursive: true });
            writeFileSync(namesPath, `${JSON.stringify({ ...saved, [voice.voice]: name }, null, 2)}\n`);
        }
        return name;
    } catch (error) {
        const fallback = saved[voice.voice] ?? voice.voice;
        const reason = error instanceof Error ? error.message : String(error);
        // Missing `voices_read` on the key is the usual cause; the label still works, just less readably.
        console.warn(`[voice] could not read the name of ${voice.voice} (${reason}); using "${fallback}"`);
        return fallback;
    }
}

/** Every declared variant of a script in a theme, with readable labels; duplicates are an error. */
export async function declaredVariants(script: Script, theme: Theme, fetchImpl: Fetch = fetch): Promise<Variant[]> {
    const variants = [];
    for (const voice of voicesOf(script))
        variants.push(variantOf(script.id, theme, voice, await voiceName(voice, fetchImpl)));
    const seen = new Map<string, number>();
    variants.forEach((variant, i) => {
        const first = seen.get(variant.name);
        if (first !== undefined) {
            throw new Error(`${script.id}: voices[${first}] and voices[${i}] are the same variant (${variant.label})`);
        }
        seen.set(variant.name, i);
    });
    return variants;
}

export function variantExists(variant: Variant): boolean {
    return existsSync(variant.dir);
}
