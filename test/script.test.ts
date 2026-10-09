import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
    allVideoIds,
    holdMs,
    loadScript,
    parseDuration,
    ScriptError,
    validateScript,
    type Script,
} from '../src/script';

const FIXTURES = join(import.meta.dirname, 'fixtures');

describe('every committed script', () => {
    it('exists', () => {
        expect(allVideoIds().length).toBeGreaterThan(0);
    });

    it.each(allVideoIds())('%s validates', (id) => {
        expect(() => loadScript(id)).not.toThrow();
    });
});

describe('an invalid script', () => {
    const fixtures = readdirSync(FIXTURES).filter((file) => file.endsWith('.yml'));

    it.each(fixtures)('%s fails with the expected message', (file) => {
        const text = readFileSync(join(FIXTURES, file), 'utf8');
        const expected = /^# expect: (.+)$/m.exec(text)?.[1];
        expect(expected, `${file} needs a "# expect:" first line`).toBeDefined();
        let error: unknown;
        try {
            validateScript(parse(text), 'demo', file);
        } catch (caught) {
            error = caught;
        }
        expect(error).toBeInstanceOf(ScriptError);
        expect((error as ScriptError).problems).toContainEqual(expect.stringContaining(expected!));
    });
});

describe('the TypeScript types', () => {
    // Every field the schema allows, written against the hand-written type: if either drifts, this
    // stops compiling or stops validating.
    const sample: Script = {
        id: 'demo',
        title: 'Demo',
        since: '0.10.0',
        formats: ['video', 'reel'],
        theme: 'light',
        voice: { provider: 'openai', voice: 'alloy', model: 'gpt-4o-mini-tts', instructions: 'calm', speed: 1.1 },
        beats: [
            { id: 'intro', text: { kind: 'title', value: 'Hello' }, say: 'Hello there.' },
            { id: 'look', text: { kind: 'callout', value: 'Here', anchor: 'thing', side: 'left' }, hold: '800ms' },
            { id: 'act' },
            { id: 'caption', text: { kind: 'caption', value: 'Words' } },
            { id: 'outro', text: { kind: 'end-card', value: 'Bye' } },
        ],
    };

    it('agree with the schema on a sample using every field', () => {
        expect(validateScript(structuredClone(sample), 'demo')).toEqual(sample);
    });
});

describe('durations', () => {
    it('parses seconds and milliseconds', () => {
        expect(parseDuration('2s')).toBe(2000);
        expect(parseDuration('1.2s')).toBe(1200);
        expect(parseDuration('800ms')).toBe(800);
    });

    it('defaults a hold to 1.2 s with text and 0 without', () => {
        expect(holdMs({ id: 'a', text: { kind: 'caption', value: 'x' } })).toBe(1200);
        expect(holdMs({ id: 'a' })).toBe(0);
        expect(holdMs({ id: 'a', hold: '2s' })).toBe(2000);
    });
});
