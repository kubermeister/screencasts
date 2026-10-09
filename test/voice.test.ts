import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElevenLabsProvider } from '../src/voice/elevenlabs';
import { OpenAIProvider } from '../src/voice/openai';
import type { Fetch, Finish } from '../src/voice/provider';

const AUDIO = Buffer.from('fake audio bytes');

/** A fetch that records each request and answers with `AUDIO`. */
function fakeFetch(status = 200) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        calls.push({ url, init: init ?? {} });
        return new Response(status === 200 ? AUDIO : 'quota exceeded', {
            status,
            headers: { 'content-type': status === 200 ? 'audio/wav' : 'text/plain' },
        });
    });
    return { fetch: fetch as unknown as Fetch, calls };
}

const finish = vi.fn<Finish>(async (audio) => ({ wav: audio, durationMs: 1234 }));

function body(init: RequestInit): Record<string, unknown> {
    return JSON.parse(String(init.body)) as Record<string, unknown>;
}

beforeEach(() => {
    finish.mockClear();
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('OpenAIProvider', () => {
    it('names the variable when the key is missing', () => {
        vi.stubEnv('OPENAI_API_KEY', '');
        expect(() => new OpenAIProvider({ finish })).toThrow('OPENAI_API_KEY');
    });

    it('asks for WAV with the model, voice, instructions and speed', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test');
        const { fetch, calls } = fakeFetch();
        const speech = await new OpenAIProvider({ fetch, finish }).synthesize('Hello there.', {
            provider: 'openai',
            voice: 'alloy',
            model: 'gpt-4o-mini-tts',
            instructions: 'calm, confident developer demo',
            speed: 1.1,
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toMatch(/\/audio\/speech$/);
        expect(body(calls[0]!.init)).toEqual({
            model: 'gpt-4o-mini-tts',
            voice: 'alloy',
            input: 'Hello there.',
            instructions: 'calm, confident developer demo',
            speed: 1.1,
            response_format: 'wav',
        });
        expect(new Headers(calls[0]!.init.headers).get('authorization')).toBe('Bearer sk-test');
        expect(finish).toHaveBeenCalledWith(AUDIO, 'wav');
        expect(speech.durationMs).toBe(1234);
    });

    it('requires a model', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test');
        const { fetch } = fakeFetch();
        await expect(
            new OpenAIProvider({ fetch, finish }).synthesize('Hi.', { provider: 'openai', voice: 'alloy' }),
        ).rejects.toThrow('voice.model');
    });
});

describe('ElevenLabsProvider', () => {
    it('names the variable when the key is missing', () => {
        vi.stubEnv('ELEVENLABS_API_KEY', '');
        expect(() => new ElevenLabsProvider({ finish })).toThrow('ELEVENLABS_API_KEY');
    });

    it('posts the text and model for raw PCM and hands it on as PCM', async () => {
        vi.stubEnv('ELEVENLABS_API_KEY', 'xi-test');
        const { fetch, calls } = fakeFetch();
        const speech = await new ElevenLabsProvider({ fetch, finish }).synthesize('Hello there.', {
            provider: 'elevenlabs',
            voice: 'JBFqnCBsd6RMkjVDRZzb',
            model: 'eleven_multilingual_v2',
            speed: 0.9,
        });
        expect(calls[0]!.url).toBe(
            'https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=pcm_44100',
        );
        expect(calls[0]!.init.method).toBe('POST');
        expect(new Headers(calls[0]!.init.headers).get('xi-api-key')).toBe('xi-test');
        expect(body(calls[0]!.init)).toEqual({
            text: 'Hello there.',
            model_id: 'eleven_multilingual_v2',
            voice_settings: { speed: 0.9 },
        });
        expect(finish).toHaveBeenCalledWith(AUDIO, 'pcm_s16le_44100');
        expect(speech.durationMs).toBe(1234);
    });

    it('reports the status and message of a failed request', async () => {
        vi.stubEnv('ELEVENLABS_API_KEY', 'xi-test');
        const { fetch } = fakeFetch(429);
        await expect(
            new ElevenLabsProvider({ fetch, finish }).synthesize('Hi.', {
                provider: 'elevenlabs',
                voice: 'v',
                model: 'eleven_multilingual_v2',
            }),
        ).rejects.toThrow('ElevenLabs answered 429: quota exceeded');
    });
});
