import type { Script } from '../script';
import type { Timeline } from '../timeline';

function timestamp(ms: number): string {
    const total = Math.max(0, Math.round(ms));
    const h = Math.floor(total / 3_600_000);
    const m = Math.floor((total % 3_600_000) / 60_000);
    const s = Math.floor((total % 60_000) / 1000);
    const pad = (value: number, width = 2) => String(value).padStart(width, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(total % 1000, 3)}`;
}

/**
 * One cue per beat with text or a spoken line, from its start to the next beat's start (the last
 * to the end). The spoken line is the cue when there is one: it is what the viewer hears.
 */
export function buildVtt(timeline: Timeline, script: Pick<Script, 'beats'>, totalMs: number): string {
    const starts = timeline.beats;
    const cues: string[] = [];
    starts.forEach((mark, i) => {
        const beat = script.beats.find((candidate) => candidate.id === mark.id);
        const text = beat?.say ?? beat?.text?.value;
        if (!text) return;
        const end = starts[i + 1]?.startMs ?? totalMs;
        cues.push(`${mark.id}\n${timestamp(mark.startMs)} --> ${timestamp(end)}\n${text}`);
    });
    return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}
