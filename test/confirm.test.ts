import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseVideoArgs, UsageError } from '../src/cli';
import { confirmAll, planAll } from '../src/confirm';
import { allVideoIds } from '../src/script';

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    // text-size names elevenlabs, whose voice lives in the maintainer's .env.
    vi.stubEnv('ELEVENLABS_VOICE', 'Dhyh3AlgVPGDnVMGBox6');
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('--all', () => {
    it('plans every video, with its voice', () => {
        const plan = planAll(allVideoIds(), parseVideoArgs(['--all']));
        expect(plan.map((video) => video.id)).toEqual(allVideoIds());
        expect(plan.every((video) => video.voices.length === 1)).toBe(true);
    });

    // Tests run without a terminal, as a script or an agent would.
    it('refuses to start without a terminal unless told --yes', async () => {
        await expect(confirmAll(allVideoIds(), parseVideoArgs(['--all']))).rejects.toThrow(UsageError);
        await expect(confirmAll(allVideoIds(), parseVideoArgs(['--all', '--yes']))).resolves.toBeUndefined();
    });
});

describe('npm run new', () => {
    it('scaffolds a Kokoro voice, never a paid one', async () => {
        const { readFileSync } = await import('node:fs');
        const scaffold = readFileSync('bin/new.ts', 'utf8');
        expect(scaffold).toContain('voice: kokoro');
        expect(scaffold).not.toMatch(/elevenlabs|openai/);
    });
});
