import { execFile } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { CDPSession, Page } from 'playwright';
import { FOOTAGE, FPS } from '../config';

const run = promisify(execFile);

interface Frame {
    file: string;
    /** When the frame was painted, ms since the epoch. */
    atMs: number;
}

export interface Recording {
    /** The first frame's timestamp; every time in the timeline is relative to it. */
    startEpochMs: number;
    endEpochMs: number;
    frames: number;
}

/**
 * Records the renderer through the DevTools screencast rather than the screen, so a covered window or
 * another app in front changes nothing. Frames arrive only when the page repaints; each one is held
 * until the next, which is what turns them into constant-rate video.
 */
export class Recorder {
    private session: CDPSession | undefined;
    private readonly frames: Frame[] = [];
    private readonly writes: Promise<void>[] = [];

    constructor(
        private readonly window: Page,
        private readonly frameDir: string,
    ) {}

    async start(): Promise<void> {
        rmSync(this.frameDir, { recursive: true, force: true });
        mkdirSync(this.frameDir, { recursive: true });
        const session = await this.window.context().newCDPSession(this.window);
        this.session = session;
        session.on('Page.screencastFrame', (event) => {
            // Acked first: Chromium sends no further frame until the previous one is acknowledged.
            session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => undefined);
            const file = join(this.frameDir, `${String(this.frames.length).padStart(6, '0')}.jpg`);
            const atMs = (event.metadata.timestamp ?? Date.now() / 1000) * 1000;
            this.frames.push({ file, atMs });
            this.writes.push(writeFile(file, Buffer.from(event.data, 'base64')));
        });
        await session.send('Page.startScreencast', {
            format: 'jpeg',
            quality: 92,
            maxWidth: FOOTAGE.width,
            maxHeight: FOOTAGE.height,
            everyNthFrame: 1,
        });
        await this.waitForFirstFrame();
    }

    /** Times are measured from the first frame, so recording only counts as started once it exists. */
    private async waitForFirstFrame(): Promise<void> {
        const deadline = Date.now() + 10_000;
        while (this.frames.length === 0) {
            if (Date.now() > deadline) throw new Error('The screencast sent no frame within 10 s');
            await new Promise((done) => setTimeout(done, 10));
        }
    }

    /** The earliest paint, not the first arrival: frames can arrive out of order. */
    get startEpochMs(): number {
        if (this.frames.length === 0) throw new Error('The recording has no frame yet');
        return Math.min(...this.frames.map((frame) => frame.atMs));
    }

    async stop(): Promise<Recording> {
        const endEpochMs = Date.now();
        await this.session?.send('Page.stopScreencast');
        await this.session?.detach().catch(() => undefined);
        await Promise.all(this.writes);
        return { startEpochMs: this.startEpochMs, endEpochMs, frames: this.frames.length };
    }

    /** Encodes the frames into `output`, then deletes them. */
    async encode(recording: Recording, output: string): Promise<void> {
        // Frames can arrive out of paint order; a backwards step would be clamped rather than cancel
        // out, and stretch the footage away from the timeline.
        const frames = [...this.frames].sort((a, b) => a.atMs - b.atMs);
        // The concat demuxer's list: each frame shown until the next one, the last until the end. The
        // last file is named twice because the demuxer ignores the final entry's duration otherwise;
        // that repeat adds a second of its own, which `-t` cuts off.
        const lines = ['ffconcat version 1.0'];
        frames.forEach((frame, i) => {
            const until = frames[i + 1]?.atMs ?? recording.endEpochMs;
            lines.push(`file '${frame.file}'`, `duration ${(Math.max(until - frame.atMs, 0) / 1000).toFixed(6)}`);
        });
        const last = frames.at(-1);
        if (last) lines.push(`file '${last.file}'`);
        const seconds = (recording.endEpochMs - recording.startEpochMs) / 1000;
        const list = join(this.frameDir, 'frames.ffconcat');
        writeFileSync(list, `${lines.join('\n')}\n`);

        await run(
            'ffmpeg',
            [
                ...['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list],
                ...['-vf', `fps=${FPS},scale=${FOOTAGE.width}:${FOOTAGE.height}:flags=lanczos`],
                ...['-t', seconds.toFixed(3), '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', '-an', output],
            ],
            { maxBuffer: 16 * 1024 * 1024 },
        );
        rmSync(this.frameDir, { recursive: true, force: true });
    }
}
