import { defineScene } from '../../../src/harness/scene';

const RELEASE = 'platform-agent';
const NAMESPACE = 'platform';

/** Needs `helm` on PATH: the demo release exists only then. Review writes nothing; Upgrade is never pressed. */
export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/helm/releases/${NAMESPACE}/${RELEASE}/upgrade`);
        const page = window.getByTestId('upgrade-release-page');
        await page.locator('.cm-line', { hasText: /^\s+enabled: true$/ }).waitFor({ timeout: 60_000 });
        await focus(page);
    },
    async run({ window, beat, anchor, click, press, type, glide }) {
        const page = window.getByTestId('upgrade-release-page');
        const removed = window.getByTestId('upgrade-review-removed');
        anchor('upgrade-review-values', window.getByTestId('upgrade-review-values'));
        anchor('upgrade-review-removed', removed);
        await beat('intro');
        await beat('values');
        await beat('edit', async () => {
            await click(page.locator('.cm-line', { hasText: /^\s+enabled: true$/ }).first());
            await press('End');
            for (let i = 0; i < 'true'.length; i++) await press('Backspace');
            await type('false');
            await click(page.getByRole('button', { name: 'Review' }));
            await window.getByTestId('upgrade-review-values').waitFor({ timeout: 60_000 });
        });
        await beat('diff');
        await beat('removed', () => glide(removed));
        await beat('outro');
    },
    async cleanup() {},
});
