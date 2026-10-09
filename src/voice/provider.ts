import type { VoiceSettings } from '../script';

export type { VoiceSettings } from '../script';

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
