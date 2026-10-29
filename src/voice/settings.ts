import type { VoiceProviderId } from '../script';
import type { VoiceSettings } from './provider';

/**
 * How each provider sounds comes from `.env`, not from the scripts: a script only names the
 * provider, so one change of voice or model applies to every video, and a paid voice id stays with
 * the maintainer. Every variable is optional except a paid provider's voice, which has no default
 * worth guessing.
 */
export type Env = Record<string, string | undefined>;

const SPEED_MIN = 0.8;
const SPEED_MAX = 1.2;

function text(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function required(value: string | undefined, name: string, hint: string): string {
    const found = text(value);
    if (!found) throw new Error(`${name} is not set; put it in .env (${hint})`);
    return found;
}

function speed(value: string | undefined, name: string): number | undefined {
    const raw = text(value);
    if (raw === undefined) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < SPEED_MIN || parsed > SPEED_MAX) {
        throw new Error(`${name} must be a number from ${SPEED_MIN} to ${SPEED_MAX}, not '${raw}'`);
    }
    return parsed;
}

/** A dictionary is named by its id and the version to apply, the two ids ElevenLabs answers a creation with. */
function dictionary(value: string | undefined, name: string): string | undefined {
    const raw = text(value);
    if (raw === undefined) return undefined;
    if (!/^[A-Za-z0-9]+\/[A-Za-z0-9]+$/.test(raw)) {
        throw new Error(`${name} must be <dictionary id>/<version id>, not '${raw}'`);
    }
    return raw;
}

/** Only the keys that are set, so two settings that sound the same are also equal. */
function compact(settings: VoiceSettings): VoiceSettings {
    return Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined)) as VoiceSettings;
}

export function voiceSettings(provider: VoiceProviderId, env: Env = process.env): VoiceSettings {
    switch (provider) {
        case 'kokoro':
            return compact({
                provider,
                voice: text(env.KOKORO_VOICE) ?? 'af_heart',
                speed: speed(env.KOKORO_SPEED, 'KOKORO_SPEED'),
            });
        case 'openai':
            return compact({
                provider,
                voice: required(env.OPENAI_VOICE, 'OPENAI_VOICE', 'e.g. alloy'),
                model: text(env.OPENAI_MODEL) ?? 'gpt-4o-mini-tts',
                instructions: text(env.OPENAI_INSTRUCTIONS),
                speed: speed(env.OPENAI_SPEED, 'OPENAI_SPEED'),
            });
        case 'elevenlabs':
            return compact({
                provider,
                voice: required(env.ELEVENLABS_VOICE, 'ELEVENLABS_VOICE', "the Voice ID from the voice's page"),
                model: text(env.ELEVENLABS_MODEL) ?? 'eleven_multilingual_v2',
                speed: speed(env.ELEVENLABS_SPEED, 'ELEVENLABS_SPEED'),
                dictionary: dictionary(env.ELEVENLABS_DICTIONARY, 'ELEVENLABS_DICTIONARY'),
            });
    }
}
