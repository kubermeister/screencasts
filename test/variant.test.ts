import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsageError } from '../src/cli';
import { removeVariant } from '../src/pipeline';
import type { VoiceSettings } from '../src/script';
import { slugify, variantFiles, variantOf, voiceLabel, voiceName, voicesOf } from '../src/variant';
import type { Fetch } from '../src/voice/provider';

const eleven: VoiceSettings = { provider: 'elevenlabs', voice: 'Dhyh3AlgVPGDnVMGBox6', model: 'eleven_v4' };

describe('slugify', () => {
    it('keeps letters and digits, joined by single hyphens', () => {
        expect(slugify('Female option 1')).toBe('female-option-1');
        expect(slugify('  Zoë — the narrator!! ')).toBe('zoe-the-narrator');
        expect(slugify('af_heart')).toBe('af-heart');
    });
});

describe('voiceLabel', () => {
    it('names a silent video', () => {
        expect(voiceLabel(undefined)).toBe('silent');
    });

    it('is provider, short model and voice name', () => {
        expect(voiceLabel(eleven, 'Female option 1')).toBe('elevenlabs-v4-female-option-1');
        expect(voiceLabel({ ...eleven, model: 'eleven_multilingual_v2' }, 'Female option 1')).toBe(
            'elevenlabs-multilingual-v2-female-option-1',
        );
        expect(voiceLabel({ provider: 'kokoro', voice: 'af_heart' })).toBe('kokoro-af-heart');
        expect(voiceLabel({ provider: 'openai', voice: 'alloy', model: 'gpt-4o-mini-tts' })).toBe(
            'openai-gpt-4o-mini-tts-alloy',
        );
    });

    it('adds speed and tone only when they are not the default', () => {
        expect(voiceLabel({ provider: 'kokoro', voice: 'af_heart', speed: 1 })).toBe('kokoro-af-heart');
        expect(voiceLabel({ provider: 'kokoro', voice: 'af_heart', speed: 0.9 })).toBe('kokoro-af-heart-speed-0.9');
        const calm = voiceLabel({ provider: 'openai', voice: 'alloy', model: 'gpt-4o-mini-tts', instructions: 'calm' });
        const brisk = voiceLabel({
            provider: 'openai',
            voice: 'alloy',
            model: 'gpt-4o-mini-tts',
            instructions: 'brisk',
        });
        expect(calm).toMatch(/^openai-gpt-4o-mini-tts-alloy-tone-[0-9a-f]{6}$/);
        expect(calm).not.toBe(brisk);
    });
});

describe('a variant', () => {
    const variant = variantOf('text-size', 'dark', eleven, 'Female option 1');

    it('is named by theme and voice, and every file repeats the name', () => {
        expect(variant.name).toBe('dark--elevenlabs-v4-female-option-1');
        const files = variantFiles(variant);
        expect(files.video('reel')).toMatch(
            /out\/text-size\/dark--elevenlabs-v4-female-option-1\/text-size--reel--dark--elevenlabs-v4-female-option-1\.mp4$/,
        );
        expect(files.captions).toMatch(/\/text-size--dark--elevenlabs-v4-female-option-1\.vtt$/);
        expect(files.state).toMatch(/\/dark--elevenlabs-v4-female-option-1\/state\.json$/);
    });

    it('comes from the first of several voices by default, or the one voice, or none', () => {
        const kokoro: VoiceSettings = { provider: 'kokoro', voice: 'af_heart' };
        expect(voicesOf({ voices: [eleven, kokoro] })).toEqual([eleven, kokoro]);
        expect(voicesOf({ voice: kokoro })).toEqual([kokoro]);
        expect(voicesOf({})).toEqual([undefined]);
    });
});

describe('voiceName', () => {
    let dir: string;
    let names: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'km-names-'));
        names = join(dir, 'names.json');
        vi.stubEnv('ELEVENLABS_API_KEY', 'xi-test');
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    const answering = (status: number, body: unknown) =>
        vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as Fetch;

    it('reads the name from ElevenLabs and keeps it', async () => {
        expect(await voiceName(eleven, answering(200, { name: 'Female option 1' }), names)).toBe('Female option 1');
        expect(JSON.parse(readFileSync(names, 'utf8'))).toEqual({ Dhyh3AlgVPGDnVMGBox6: 'Female option 1' });
    });

    it('falls back to the kept name, then to the id, when ElevenLabs cannot answer', async () => {
        expect(await voiceName(eleven, answering(401, {}), names)).toBe('Dhyh3AlgVPGDnVMGBox6');
        writeFileSync(names, JSON.stringify({ Dhyh3AlgVPGDnVMGBox6: 'Earlier name' }));
        expect(await voiceName(eleven, answering(500, {}), names)).toBe('Earlier name');
    });

    it('asks nobody for a voice whose id is already readable', async () => {
        const fetch = answering(200, {});
        expect(await voiceName({ provider: 'kokoro', voice: 'af_heart' }, fetch, names)).toBe('af_heart');
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe('removeVariant', () => {
    it.each(['../text-size', 'dark--x/../..', 'nope'])('refuses %s', (name) => {
        expect(() => removeVariant('text-size', name)).toThrow(UsageError);
    });
});
