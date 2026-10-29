import { defineScene } from '../../../src/harness/scene';

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/overview/summary');
        await window.getByTestId('cluster-summary').waitFor({ timeout: 60_000 });
        await focus(window.getByTestId('cluster-summary'));
    },
    async run({ window, beat, anchor, press, hold }) {
        anchor('sheet', window.getByTestId('shortcuts-dialog'));
        await beat('intro');
        await beat('domains', async () => {
            await press('Meta+2');
            await window.getByTestId('pods-table').waitFor({ timeout: 60_000 });
            await hold(800);
            await press('Meta+3');
            await hold(800);
            await press('Meta+2');
            await window.getByTestId('pods-table').waitFor({ timeout: 60_000 });
        });
        await beat('search', async () => {
            await press('/');
            await hold(600);
        });
        await beat('sheet', async () => {
            // Single keys act outside text fields, so the search box is left before the sheet is asked for.
            await press('Escape');
            await press('?');
            await window.getByTestId('shortcuts-dialog').waitFor({ timeout: 30_000 });
        });
        await beat('outro');
    },
    async cleanup({ window }) {
        await window.keyboard.press('Escape');
    },
});
