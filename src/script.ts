import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse } from 'yaml';
import { ROOT, type Theme } from './config';

export type TextKind = 'title' | 'caption' | 'callout' | 'end-card';
export type CalloutSide = 'auto' | 'above' | 'below' | 'left' | 'right';
export type Format = 'video' | 'reel';
export type VoiceProviderId = 'kokoro' | 'openai' | 'elevenlabs';

export interface BeatText {
    kind: TextKind;
    value: string;
    /** Only on a callout: the name a scene registers with `anchor()`. */
    anchor?: string;
    side?: CalloutSide;
}

export interface Beat {
    id: string;
    text?: BeatText;
    say?: string;
    /** A duration such as `2s` or `800ms`. */
    hold?: string;
}

export interface VoiceSettings {
    provider: VoiceProviderId;
    voice: string;
    model?: string | null;
    instructions?: string | null;
    speed?: number;
}

export interface Script {
    id: string;
    title: string;
    since: string;
    formats?: Format[];
    theme?: Theme;
    voice?: VoiceSettings;
    beats: Beat[];
}

/** The folders a video can live in: one per feature, plus the overview and the hero. */
export function videoDir(id: string): string {
    if (id === 'overview' || id === 'hero') return join(ROOT, id);
    return join(ROOT, 'features', id);
}

export function parseDuration(value: string): number {
    const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(value);
    if (!match) throw new Error(`Not a duration: ${value}`);
    const amount = Number(match[1]);
    return match[2] === 's' ? amount * 1000 : amount;
}

/** Text needs reading time even when nothing is said; a pure-action beat needs none. */
export function holdMs(beat: Beat): number {
    if (beat.hold !== undefined) return parseDuration(beat.hold);
    return beat.text ? 1200 : 0;
}

export function formatsOf(script: Script): Format[] {
    return script.formats ?? ['video', 'reel'];
}

export function themeOf(script: Script): Theme {
    return script.theme ?? 'dark';
}

export function readScriptFile(path: string): unknown {
    return parse(readFileSync(path, 'utf8'));
}

export function loadScript(id: string): Script {
    const dir = videoDir(id);
    const path = join(dir, 'script.yml');
    if (!existsSync(path)) throw new Error(`No script at ${path}`);
    const script = readScriptFile(path) as Script;
    if (script.id !== basename(dir)) throw new Error(`${path}: id '${script.id}' must equal the folder name`);
    return script;
}
