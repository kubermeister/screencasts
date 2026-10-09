import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageJson {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as PackageJson;
const all = { ...pkg.dependencies, ...pkg.devDependencies };

describe('package.json', () => {
    // A caret lets two installs of the same commit film with different libraries, which breaks
    // "a re-render looks the same".
    it('pins every dependency to an exact version', () => {
        const ranged = Object.entries(all).filter(([, version]) => !/^\d+\.\d+\.\d+$/.test(version));
        expect(ranged).toEqual([]);
    });

    // Remotion refuses to bundle when its packages disagree on the version.
    it('keeps remotion and every @remotion/* package on one version', () => {
        const versions = new Set(
            Object.entries(all)
                .filter(([name]) => name === 'remotion' || name.startsWith('@remotion/'))
                .map(([, version]) => version),
        );
        expect(versions.size).toBe(1);
    });
});

describe('configuration', () => {
    // Read by the code, but set by the OS or Playwright's own conventions rather than by a person.
    const SYSTEM = new Set(['PATH', 'LOCALAPPDATA', 'XDG_CACHE_HOME', 'PLAYWRIGHT_BROWSERS_PATH']);

    function sources(dir: string): string[] {
        return readdirSync(dir, { withFileTypes: true, recursive: true })
            .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
            .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'));
    }

    it('lists every variable the code reads in .env.example', () => {
        const read = new Set(
            [...sources('src'), ...sources('bin')].flatMap((source) =>
                [...source.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)|env\.([A-Z][A-Z0-9_]{3,})/g)].map(
                    (match) => match[1] ?? match[2]!,
                ),
            ),
        );
        const example = readFileSync('.env.example', 'utf8');
        const missing = [...read].filter(
            (name) => !SYSTEM.has(name) && !new RegExp(`^#? ?${name}=`, 'm').test(example),
        );
        expect(missing).toEqual([]);
    });

    // A key in a tracked file is published with the repository.
    it('keeps .env out of git', () => {
        expect(() => execFileSync('git', ['check-ignore', '-q', '.env'])).not.toThrow();
        expect(() => execFileSync('git', ['check-ignore', '-q', '.env.example'])).toThrow();
    });
});
