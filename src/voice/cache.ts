import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT_DIR } from '../config';
import type { VoiceSettings } from './provider';

export const VOICE_DIR = join(OUT_DIR, 'voice');

/**
 * Everything that changes how a line sounds, and nothing else, so the same line in two videos or two
 * runs is synthesized once. Absent and null mean the same; speed defaults to 1.
 */
export function voiceKey(settings: VoiceSettings, text: string): string {
    const parts = [
        settings.provider,
        settings.model ?? '',
        settings.voice,
        settings.instructions ?? '',
        String(settings.speed ?? 1),
        text,
    ];
    return createHash('sha256').update(parts.join('|')).digest('hex');
}

export interface CachedLine {
    key: string;
    file: string;
    durationMs: number;
}

export function cachedLine(key: string): CachedLine | undefined {
    const file = join(VOICE_DIR, `${key}.wav`);
    const meta = join(VOICE_DIR, `${key}.json`);
    if (!existsSync(file) || !existsSync(meta)) return undefined;
    const { durationMs } = JSON.parse(readFileSync(meta, 'utf8')) as { durationMs: number };
    return { key, file, durationMs };
}

export function storeLine(key: string, wav: Buffer, durationMs: number): CachedLine {
    mkdirSync(VOICE_DIR, { recursive: true });
    const file = join(VOICE_DIR, `${key}.wav`);
    writeFileSync(file, wav);
    // Written after the audio, so a line with metadata always has its audio.
    writeFileSync(join(VOICE_DIR, `${key}.json`), `${JSON.stringify({ durationMs })}\n`);
    return { key, file, durationMs };
}
