import { describe, expect, it } from 'vitest';
import type { VoiceSettings } from '../src/script';
import { voiceKey } from '../src/voice/cache';

const base: VoiceSettings = { provider: 'kokoro', voice: 'af_heart', speed: 1 };

describe('voiceKey', () => {
    it('is a stable sha256', () => {
        expect(voiceKey(base, 'Hello.')).toMatch(/^[0-9a-f]{64}$/);
        expect(voiceKey(base, 'Hello.')).toBe(voiceKey({ ...base }, 'Hello.'));
    });

    it('treats absent and null alike, and speed 1 as the default', () => {
        const spelled: VoiceSettings = { provider: 'kokoro', voice: 'af_heart', model: null, instructions: null };
        expect(voiceKey(spelled, 'Hello.')).toBe(voiceKey(base, 'Hello.'));
    });

    it.each<[string, Partial<VoiceSettings>]>([
        ['provider', { provider: 'openai', model: 'gpt-4o-mini-tts' }],
        ['model', { model: 'other' }],
        ['voice', { voice: 'am_adam' }],
        ['instructions', { instructions: 'calm' }],
        ['speed', { speed: 1.1 }],
    ])('changes with the %s', (_name, change) => {
        expect(voiceKey({ ...base, ...change }, 'Hello.')).not.toBe(voiceKey(base, 'Hello.'));
    });

    it('changes with the text', () => {
        expect(voiceKey(base, 'Hello!')).not.toBe(voiceKey(base, 'Hello.'));
    });
});
