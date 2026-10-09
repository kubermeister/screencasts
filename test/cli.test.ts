import { describe, expect, it } from 'vitest';
import { parseVideoArgs, UsageError } from '../src/cli';

describe('parseVideoArgs', () => {
    it('reads an id and its flags', () => {
        expect(parseVideoArgs(['text-size', '--format', 'reel', '--only', 'record', '--frames'])).toMatchObject({
            id: 'text-size',
            format: 'reel',
            only: 'record',
            frames: true,
            all: false,
        });
    });

    it('takes --all instead of an id', () => {
        expect(parseVideoArgs(['--all', '--fresh'])).toMatchObject({ all: true, fresh: true });
    });

    it('reads the voice, variants and remove options', () => {
        expect(parseVideoArgs(['text-size', '--voice', 'all'])).toMatchObject({ voice: 'all' });
        expect(parseVideoArgs(['text-size', '--variants'])).toMatchObject({ variants: true });
        expect(parseVideoArgs(['text-size', '--remove', 'dark--silent'])).toMatchObject({ remove: 'dark--silent' });
    });

    it.each([
        [['a', '--voice']],
        [['a', '--remove', '--fresh']],
        [['--all', '--remove', 'x']],
        [['a', '--variants', '--remove', 'x']],
        [[]],
        [['a', 'b']],
        [['a', '--all']],
        [['a', '--format', 'square']],
        [['a', '--theme']],
        [['a', '--nope']],
    ])('rejects %j as a usage error', (argv) => {
        expect(() => parseVideoArgs(argv)).toThrow(UsageError);
    });
});
