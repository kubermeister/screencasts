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

    it.each([
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
