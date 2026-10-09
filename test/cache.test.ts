import { describe, expect, it } from 'vitest';
import { loadScript, type VoiceSettings } from '../src/script';
import { sceneKey } from '../src/state';
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

describe('sceneKey', () => {
    const script = loadScript('text-size');
    const theme = 'dark';
    const silent = new Map<string, number>();
    const key = sceneKey(script, theme, silent);

    it('ignores the wording, which changes no frame of the footage', () => {
        const reworded = structuredClone(script);
        reworded.beats[1]!.text!.value = 'Something else entirely';
        expect(sceneKey(reworded, theme, silent)).toBe(key);
    });

    it('changes with a hold, a voice duration and the theme', () => {
        const held = structuredClone(script);
        held.beats[1]!.hold = '3s';
        expect(sceneKey(held, theme, silent)).not.toBe(key);
        expect(sceneKey(script, theme, new Map([['intro', 4000]]))).not.toBe(key);
        expect(sceneKey(script, 'light', silent)).not.toBe(key);
    });
});
