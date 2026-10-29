import type { Script } from '../script';
import { cachedLine, storeLine, voiceKey, type CachedLine } from './cache';
import { ElevenLabsProvider } from './elevenlabs';
import { KokoroProvider } from './kokoro';
import { OpenAIProvider } from './openai';
import type { VoiceProvider, VoiceSettings } from './provider';

const providers = new Map<string, VoiceProvider>();

/** One provider instance per run, so Kokoro's model loads once for every line and every video. */
function provider(id: string): VoiceProvider {
    let found = providers.get(id);
    if (!found) {
        found =
            id === 'openai'
                ? new OpenAIProvider()
                : id === 'elevenlabs'
                  ? new ElevenLabsProvider()
                  : new KokoroProvider();
        providers.set(id, found);
    }
    return found;
}

/** The spoken lines of a script in one voice, by beat id, with the cache key each would have. */
export function plannedLines(
    script: Script,
    voice: VoiceSettings | undefined,
): { beatId: string; key: string; text: string }[] {
    if (!voice) return [];
    return script.beats.flatMap((beat) =>
        beat.say ? [{ beatId: beat.id, key: voiceKey(voice, beat.say), text: beat.say }] : [],
    );
}

/** Lines already in the cache, by beat id; lines not yet synthesized are absent. */
export function cachedLines(script: Script, voice: VoiceSettings | undefined): Map<string, CachedLine> {
    const lines = new Map<string, CachedLine>();
    for (const line of plannedLines(script, voice)) {
        const cached = cachedLine(line.key);
        if (cached) lines.set(line.beatId, cached);
    }
    return lines;
}

/** Synthesizes every line not in the cache (every line with `fresh`) and returns all of them by beat id. */
export async function synthesizeLines(
    script: Script,
    voice: VoiceSettings | undefined,
    { fresh = false } = {},
): Promise<Map<string, CachedLine>> {
    const lines = new Map<string, CachedLine>();
    if (!voice) return lines;
    for (const line of plannedLines(script, voice)) {
        const cached = fresh ? undefined : cachedLine(line.key);
        if (cached) {
            lines.set(line.beatId, cached);
            continue;
        }
        console.log(`[voice] ${script.id}/${line.beatId}: synthesizing with ${voice.provider} (${voice.voice})`);
        const speech = await provider(voice.provider).synthesize(line.text, voice);
        lines.set(line.beatId, storeLine(line.key, speech.wav, speech.durationMs));
    }
    return lines;
}
