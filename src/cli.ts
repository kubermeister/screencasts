import type { Theme } from './config';
import type { Format } from './script';

export type Stage = 'record' | 'voice' | 'render';

export interface VideoArgs {
    /** One video id, or every one with `all`. */
    id?: string;
    all: boolean;
    format?: Format;
    only?: Stage;
    fresh: boolean;
    frames: boolean;
    open: boolean;
    compare: boolean;
    theme?: Theme;
}

export class UsageError extends Error {}

export const USAGE = `Usage:
  npm run video -- <id> [--format video|reel] [--only record|voice|render] [--fresh] [--frames]
                        [--open] [--theme dark|light] [--compare]
  npm run video -- --all [same flags]`;

function oneOf<T extends string>(flag: string, value: string | undefined, allowed: readonly T[]): T {
    if (value === undefined || !(allowed as readonly string[]).includes(value)) {
        throw new UsageError(`${flag} takes one of: ${allowed.join(', ')}`);
    }
    return value as T;
}

export function parseVideoArgs(argv: readonly string[]): VideoArgs {
    const args: VideoArgs = { all: false, fresh: false, frames: false, open: false, compare: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]!;
        switch (arg) {
            case '--all':
                args.all = true;
                break;
            case '--fresh':
                args.fresh = true;
                break;
            case '--frames':
                args.frames = true;
                break;
            case '--open':
                args.open = true;
                break;
            case '--compare':
                args.compare = true;
                break;
            case '--format':
                args.format = oneOf(arg, argv[++i], ['video', 'reel'] as const);
                break;
            case '--only':
                args.only = oneOf(arg, argv[++i], ['record', 'voice', 'render'] as const);
                break;
            case '--theme':
                args.theme = oneOf(arg, argv[++i], ['dark', 'light'] as const);
                break;
            default:
                if (arg.startsWith('-')) throw new UsageError(`Unknown option ${arg}`);
                if (args.id !== undefined) throw new UsageError(`One id at a time (got ${args.id} and ${arg})`);
                args.id = arg;
        }
    }
    if (args.all === (args.id !== undefined)) throw new UsageError('Give one id, or --all');
    return args;
}
