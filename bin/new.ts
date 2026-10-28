// First: everything after it may read process.env as it loads.
import '../src/env';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from '../src/config';
import { appVersion, checkApp } from '../src/harness/app';
import { GROUPS, groupOf, isGroup } from '../src/script';

const USAGE = `Usage: npm run new -- <group>/<id>   (group: ${GROUPS.join(' | ')}; id: lowercase words joined by hyphens, e.g. navigation/text-size)`;

function title(id: string): string {
    const words = id.split('-').join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function scriptYaml(id: string, since: string): string {
    return `# yaml-language-server: $schema=../../../schema/script.schema.json
id: ${id}
title: ${title(id)}
since: ${since}
formats: [video, reel]
theme: dark
# Kokoro only: it runs locally for free. Paid voices (ElevenLabs, OpenAI) are added by the maintainer.
voice: kokoro
beats:
  - id: intro
    text: { kind: title, value: 'TODO: what the feature lets you do' }
  - id: show
    text: { kind: caption, value: 'TODO: where it is, e.g. Settings › Appearance' }
  - id: outro
    text: { kind: end-card, value: 'kubermeister.dev' }
`;
}

const SCENE_TS = `import { defineScene } from '../../../src/harness/scene';

export default defineScene({
    // Before the video starts: not filmed.
    async setup({ goto }) {
        // TODO: open the screen the video starts on and wait for it, e.g.
        // await goto('/settings/appearance');
        await goto('/overview/summary');
    },
    // The video: mark every beat of script.yml, in order.
    async run({ beat }) {
        await beat('intro');
        await beat('show');
        // TODO: drive the feature with click(), type() and press(), selectors as in the app's
        // tests/demo/shots/screenshots.test.ts.
        await beat('outro');
    },
    // After the video ends: not filmed. Back out of anything that would block closing.
    async cleanup() {},
});
`;

function main(target: string | undefined): number {
    const [group, id, ...rest] = (target ?? '').split('/');
    if (!group || !id || rest.length > 0 || !isGroup(group) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
        console.error(USAGE);
        return 2;
    }
    const taken = groupOf(id);
    if (taken !== undefined) {
        console.error(`features/${taken}/${id} already exists; edit it, or pick another id`);
        return 1;
    }
    const dir = join(ROOT, 'features', group, id);
    checkApp();
    const since = appVersion();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'script.yml'), scriptYaml(id, since));
    writeFileSync(join(dir, 'scene.ts'), SCENE_TS);
    console.log(`Created ${relative(ROOT, dir)}/script.yml and scene.ts (since ${since}).`);
    console.log(`Write the beats and the scene, then: npm run video -- ${id} --frames`);
    return 0;
}

try {
    process.exitCode = main(process.argv[2]);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
