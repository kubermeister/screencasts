import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
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
    /** An anchor the scene registers: the 16:9 video and the reel zoom in on it for this beat. */
    zoom?: string;
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

/** Every video in the repository: each folder of features/, then the overview and the hero. */
export function allVideoIds(): string[] {
    const features = existsSync(join(ROOT, 'features'))
        ? readdirSync(join(ROOT, 'features'), { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name)
              .sort()
        : [];
    return [...features, ...['overview', 'hero'].filter((id) => existsSync(join(ROOT, id, 'script.yml')))];
}

/** The anchors a beat points at: its callout's and its zoom's. */
export function beatAnchors(beat: Beat): string[] {
    const names = [beat.text?.kind === 'callout' ? beat.text.anchor : undefined, beat.zoom];
    return [...new Set(names.filter((name): name is string => name !== undefined))];
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

export const SCHEMA_PATH = join(ROOT, 'schema/script.schema.json');

/** Every problem with a script at once, each naming where it is, so one edit fixes them all. */
export class ScriptError extends Error {
    constructor(
        readonly path: string,
        readonly problems: string[],
    ) {
        super(`${path} is invalid:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    }
}

let compiled: ValidateFunction | undefined;

function schemaValidator(): ValidateFunction {
    // Strict, except `strictRequired`: it rejects `required` inside an if/then branch that does not
    // redeclare the property, which is how JSON Schema says "a callout needs an anchor".
    compiled ??= new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(
        JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as object,
    );
    return compiled;
}

/** `/beats/2/text/value` → `beats[2] (larger).text.value`, so a message names the beat by its id. */
function location(data: unknown, instancePath: string): string {
    if (instancePath === '') return 'script';
    const parts = instancePath.split('/').slice(1);
    let node: unknown = data;
    let out = '';
    for (const part of parts) {
        node = (node as Record<string, unknown> | undefined)?.[part];
        if (/^\d+$/.test(part)) {
            const id = (node as { id?: unknown } | undefined)?.id;
            out += `[${part}]${typeof id === 'string' ? ` (${id})` : ''}`;
        } else {
            out += out === '' ? part : `.${part}`;
        }
    }
    return out;
}

function valueAt(data: unknown, instancePath: string): unknown {
    return instancePath
        .split('/')
        .slice(1)
        .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], data);
}

const PATTERN_HINTS: Record<string, string> = {
    '^[a-z0-9]+(-[a-z0-9]+)*$': 'lowercase words joined by hyphens, e.g. text-size',
    '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$': 'a version X.Y.Z with no leading v',
    '^\\d+(\\.\\d+)?(ms|s)$': 'a duration such as 1.2s or 800ms',
};

function describe(data: unknown, error: ErrorObject): string | undefined {
    const where = location(data, error.instancePath);
    const params = error.params as Record<string, unknown>;
    switch (error.keyword) {
        // The branch that failed reports its own error; "must match then schema" adds nothing.
        case 'if':
            return undefined;
        case 'additionalProperties':
            return `${where}: unknown key '${String(params.additionalProperty)}'`;
        case 'required':
            if (params.missingProperty === 'anchor') return `${where}: a callout needs an anchor`;
            if (params.missingProperty === 'model') return `${where}: this provider needs a model`;
            return `${where}: missing '${String(params.missingProperty)}'`;
        case 'not':
            return `${where}: anchor and side are only allowed on a callout`;
        case 'enum':
            return `${where}: must be one of ${(params.allowedValues as unknown[]).join(', ')}`;
        case 'pattern': {
            const hint = PATTERN_HINTS[String(params.pattern)];
            return `${where}: must be ${hint ?? `matching ${String(params.pattern)}`}`;
        }
        case 'maxLength': {
            const value = valueAt(data, error.instancePath);
            const length = typeof value === 'string' ? value.length : 0;
            return `${where}: ${length} characters, at most ${String(params.limit)} allowed`;
        }
        case 'type':
            if (error.instancePath.endsWith('/instructions')) return `${where}: instructions are for openai only`;
            return `${where}: must be ${String(params.type)}`;
        default:
            return `${where}: ${error.message ?? error.keyword}`;
    }
}

/** The rules a JSON Schema cannot say: where titles and end cards go, and unique beat ids. */
function crossFieldProblems(script: Script, folder: string): string[] {
    const problems: string[] = [];
    if (script.id !== folder) problems.push(`id: '${script.id}' must equal the folder name '${folder}'`);
    const seen = new Set<string>();
    script.beats.forEach((beat, i) => {
        const where = `beats[${i}] (${beat.id})`;
        if (seen.has(beat.id)) problems.push(`${where}: beat id '${beat.id}' is used twice`);
        seen.add(beat.id);
        if (beat.text?.kind === 'title' && i !== 0) problems.push(`${where}: a title must be the first beat`);
        if (beat.text?.kind === 'end-card' && i !== script.beats.length - 1) {
            problems.push(`${where}: an end card must be the last beat`);
        }
    });
    return problems;
}

/** Validates a parsed script.yml against the schema and the cross-field rules. */
export function validateScript(data: unknown, folder: string, path = `${folder}/script.yml`): Script {
    const validate = schemaValidator();
    if (!validate(data)) {
        const problems = [
            ...new Set((validate.errors ?? []).map((error) => describe(data, error)).filter((p) => p !== undefined)),
        ];
        throw new ScriptError(path, problems);
    }
    const script = data as Script;
    const problems = crossFieldProblems(script, folder);
    if (problems.length > 0) throw new ScriptError(path, problems);
    return script;
}

export function readScriptFile(path: string): unknown {
    return parse(readFileSync(path, 'utf8'));
}

export function loadScript(id: string): Script {
    const dir = videoDir(id);
    const path = join(dir, 'script.yml');
    if (!existsSync(path)) throw new Error(`No script at ${path}; scaffold one with \`npm run new -- ${id}\``);
    return validateScript(readScriptFile(path), basename(dir), path);
}
