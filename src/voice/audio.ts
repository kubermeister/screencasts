import { execFile, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Finish } from './provider';

const run = promisify(execFile);

export const SAMPLE_RATE = 48_000;

/** The input flags that tell ffmpeg what a provider's bytes are. */
const INPUT: Record<Parameters<Finish>[1], string[]> = {
    wav: ['-f', 'wav'],
    // ElevenLabs' raw PCM carries no header to say what it is.
    pcm_s16le_24000: ['-f', 's16le', '-ar', '24000', '-ac', '1'],
};

function ffmpeg(args: string[], input: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', ['-v', 'error', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
        child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
        child.on('error', reject);
        child.on('close', (code) =>
            code === 0
                ? resolve(Buffer.concat(out))
                : reject(new Error(`ffmpeg failed: ${Buffer.concat(err).toString().trim()}`)),
        );
        child.stdin.end(input);
    });
}

/** The length of a WAV file as ffprobe reads it, in ms. */
export async function probeDurationMs(wav: Buffer): Promise<number> {
    const dir = mkdtempSync(join(tmpdir(), 'km-voice-'));
    try {
        const file = join(dir, 'speech.wav');
        writeFileSync(file, wav);
        const { stdout } = await run('ffprobe', [
            ...['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
        ]);
        const seconds = Number.parseFloat(stdout.trim());
        if (!Number.isFinite(seconds)) throw new Error(`ffprobe could not read a duration: ${stdout.trim()}`);
        return Math.round(seconds * 1000);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * Every provider's audio rewritten as the same WAV: providers differ in rate and channels, and some
 * stream a WAV whose header has no length, which players and ffprobe then guess at.
 */
export const finishWithFfmpeg: Finish = async (audio, format) => {
    const wav = await ffmpeg(
        [
            ...INPUT[format],
            ...['-i', 'pipe:0', '-ac', '1', '-ar', String(SAMPLE_RATE), '-c:a', 'pcm_s16le'],
            ...['-map_metadata', '-1', '-f', 'wav', 'pipe:1'],
        ],
        audio,
    );
    const fixed = fixHeader(wav);
    return { wav: fixed, durationMs: await probeDurationMs(fixed) };
};

/**
 * ffmpeg writing WAV to a pipe cannot go back to fill in the RIFF and data sizes, so they are set
 * here from the actual byte count.
 */
function fixHeader(wav: Buffer): Buffer {
    const fixed = Buffer.from(wav);
    fixed.writeUInt32LE(fixed.length - 8, 4);
    const data = fixed.indexOf('data', 12, 'ascii');
    if (data !== -1) fixed.writeUInt32LE(fixed.length - data - 8, data + 4);
    return fixed;
}
