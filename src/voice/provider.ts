import type { VoiceProviderId } from '../script';

/** One provider's resolved settings: what a line is synthesized with, from `.env` (see settings.ts). */
export interface VoiceSettings {
    provider: VoiceProviderId;
    voice: string;
    /** Absent for Kokoro, which has one model. */
    model?: string;
    /** openai only: delivery style. */
    instructions?: string;
    /** 0.8–1.2; absent means 1. */
    speed?: number;
}

export interface Speech {
    /** Canonical WAV: mono, 16-bit PCM, 48 kHz. */
    wav: Buffer;
    durationMs: number;
}

export interface VoiceProvider {
    id: string;
    synthesize(text: string, settings: VoiceSettings): Promise<Speech>;
}

/** Turns whatever a provider returned into canonical WAV and measures it. Injected so tests need no ffmpeg. */
export type Finish = (audio: Buffer, format: 'wav' | 'pcm_s16le_24000') => Promise<Speech>;

export type Fetch = typeof fetch;
