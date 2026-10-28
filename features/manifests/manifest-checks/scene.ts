import { defineScene } from '../../../src/harness/scene';

/** The Create screen with a template: a live object already carries every defaulted field, so it has less to offer. */
export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/create');
        await window.getByRole('combobox', { name: 'Insert template' }).click();
        await window.getByRole('option', { name: /^Deployment / }).click();
        const page = window.getByTestId('create-page');
        await page.locator('.cm-line', { hasText: 'kind: Deployment' }).waitFor({ timeout: 30_000 });
        await focus(page.locator('.cm-editor'));
    },
    async run({ window, beat, anchor, click, press, type }) {
        const page = window.getByTestId('create-page');
        anchor('error', page.locator('.cm-lintRange-error').first());
        anchor('warning', page.locator('.cm-lintRange-warning').first());
        anchor('completion', window.locator('.cm-tooltip-autocomplete'));
        await beat('intro');
        await beat('error', async () => {
            await click(page.locator('.cm-line', { hasText: /^\s{2}replicas: \d+$/ }).first());
            await press('End');
            await press('Backspace');
            await type('two');
            // The first check of a kind fetches its schema from the cluster.
            await page.locator('.cm-lintRange-error').first().waitFor({ timeout: 60_000 });
        });
        await beat('warning', async () => {
            // Enter keeps the indentation of the line above.
            await press('Enter');
            await type('replica: 2');
            await page.locator('.cm-lintRange-warning').first().waitFor({ timeout: 30_000 });
        });
        await beat('completion', async () => {
            await press('Enter');
            await type('strat');
            await window.locator('.cm-tooltip-autocomplete').waitFor({ timeout: 30_000 });
        });
        await beat('outro');
    },
    async cleanup({ window }) {
        await window.keyboard.press('Escape');
    },
});
