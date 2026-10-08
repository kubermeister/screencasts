import { readFileSync } from 'node:fs';
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
