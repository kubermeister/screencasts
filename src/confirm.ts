import { createInterface } from 'node:readline/promises';
import { UsageError, type VideoArgs } from './cli';
import { loadScript } from './script';
import { voicesOf } from './variant';
import { cachedLine, voiceKey } from './voice/cache';

/** Providers that bill per character; Kokoro runs locally and costs nothing. */
const PAID = new Set(['elevenlabs', 'openai']);

export interface PlannedVideo {
    id: string;
    voices: string[];
    /** Characters a paid provider would be billed for: `say` lines not in the cache yet. */
    paidCharacters: number;
}

/** What an `--all` run would render, and what it would cost in paid voice characters. */
export function planAll(ids: string[], args: VideoArgs): PlannedVideo[] {
    return ids.map((id) => {
        const script = loadScript(id);
        const declared = voicesOf(script);
        const voices = args.voice === 'all' ? declared : [declared[0]];
        let paidCharacters = 0;
        for (const voice of voices) {
            if (!voice || !PAID.has(voice.provider)) continue;
            for (const beat of script.beats) {
                if (beat.say && !cachedLine(voiceKey(voice, beat.say))) paidCharacters += beat.say.length;
            }
        }
        const names = voices.map((voice) =>
            voice ? `${voice.provider} ${voice.model ?? ''} ${voice.voice}`.replace(/\s+/g, ' ') : 'silent',
        );
        return { id, voices: names, paidCharacters };
    });
}

/**
 * `--all` renders every video, which takes a long time and can spend paid voice credits, so it is
 * never started by accident: the plan is shown and a person has to say yes. Without a terminal to
 * ask (a script, an agent), only `--yes` lets it run.
 */
export async function confirmAll(ids: string[], args: VideoArgs): Promise<void> {
    const plan = planAll(ids, args);
    const paid = plan.reduce((sum, video) => sum + video.paidCharacters, 0);
    console.log(`--all would render ${plan.length} videos:`);
    for (const video of plan) {
        const cost = video.paidCharacters > 0 ? `  ← ${video.paidCharacters} paid voice characters` : '';
        console.log(`  ${video.id.padEnd(20)} ${video.voices.join(', ')}${cost}`);
    }
    console.log(paid > 0 ? `In all: ${paid} characters billed by paid voice providers.` : 'No paid voice characters.');
    if (args.yes) return;
    if (!process.stdin.isTTY) {
        throw new UsageError('--all renders every video; with no terminal to ask, pass --yes to confirm');
    }
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = (await prompt.question('Continue? [y/N] ')).trim().toLowerCase();
        if (answer !== 'y' && answer !== 'yes') throw new UsageError('Cancelled');
    } finally {
        prompt.close();
    }
}
