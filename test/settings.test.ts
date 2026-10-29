import { describe, expect, it } from 'vitest';
import { voiceSettings } from '../src/voice/settings';

describe('voiceSettings', () => {
    it('gives Kokoro a voice with an empty .env, and takes one from it', () => {
        expect(voiceSettings('kokoro', {})).toEqual({ provider: 'kokoro', voice: 'af_heart' });
        expect(voiceSettings('kokoro', { KOKORO_VOICE: 'bf_emma', KOKORO_SPEED: '0.9' })).toEqual({
            provider: 'kokoro',
            voice: 'bf_emma',
            speed: 0.9,
        });
    });

    it('names the variable a paid provider is missing', () => {
        expect(() => voiceSettings('openai', {})).toThrow('OPENAI_VOICE');
        expect(() => voiceSettings('elevenlabs', { ELEVENLABS_VOICE: ' ' })).toThrow('ELEVENLABS_VOICE');
    });

    it('fills in a paid provider from .env, with the usual model by default', () => {
        expect(voiceSettings('openai', { OPENAI_VOICE: 'alloy', OPENAI_INSTRUCTIONS: 'calm' })).toEqual({
            provider: 'openai',
            voice: 'alloy',
            model: 'gpt-4o-mini-tts',
            instructions: 'calm',
        });
        expect(
            voiceSettings('elevenlabs', {
                ELEVENLABS_VOICE: 'Dhyh3AlgVPGDnVMGBox6',
                ELEVENLABS_MODEL: 'eleven_v4',
                ELEVENLABS_SPEED: '1.1',
            }),
        ).toEqual({ provider: 'elevenlabs', voice: 'Dhyh3AlgVPGDnVMGBox6', model: 'eleven_v4', speed: 1.1 });
    });

    it('takes a pronunciation dictionary as id and version, and refuses any other shape', () => {
        const env = {
            ELEVENLABS_VOICE: 'Dhyh3AlgVPGDnVMGBox6',
            ELEVENLABS_DICTIONARY: 'fx6HVnfG1uF4X3nG10he/FyHvUx0OxFhV6vcv3I7P',
        };
        expect(voiceSettings('elevenlabs', env).dictionary).toBe('fx6HVnfG1uF4X3nG10he/FyHvUx0OxFhV6vcv3I7P');
        expect(() => voiceSettings('elevenlabs', { ...env, ELEVENLABS_DICTIONARY: 'fx6HVnfG1uF4X3nG10he' })).toThrow(
            'ELEVENLABS_DICTIONARY',
        );
    });

    it.each(['1.5', '0.5', 'fast'])('refuses the speed %s', (speed) => {
        expect(() => voiceSettings('kokoro', { KOKORO_SPEED: speed })).toThrow('KOKORO_SPEED');
    });
});
