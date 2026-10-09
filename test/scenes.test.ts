import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allVideoIds, loadScript, videoDir } from '../src/script';

/** String literals passed to `name(…)`, in source order: a static scan, so no scene has to run. */
function calls(source: string, name: string): string[] {
    const pattern = new RegExp(`\\b${name}\\(\\s*(['"\`])([^'"\`]+)\\1`, 'g');
    return [...source.matchAll(pattern)].map((match) => match[2]!);
}

describe.each(allVideoIds())('%s/scene.ts', (id) => {
    const path = join(videoDir(id), 'scene.ts');
    const script = loadScript(id);

    it('exists', () => {
        expect(existsSync(path)).toBe(true);
    });

    it('marks exactly the beats of its script, in order', () => {
        expect(calls(readFileSync(path, 'utf8'), 'beat')).toEqual(script.beats.map((beat) => beat.id));
    });

    it('registers exactly the anchors its callouts use', () => {
        const registered = new Set(calls(readFileSync(path, 'utf8'), 'anchor'));
        const used = new Set(script.beats.flatMap((beat) => (beat.text?.anchor ? [beat.text.anchor] : [])));
        expect(registered).toEqual(used);
    });
});
