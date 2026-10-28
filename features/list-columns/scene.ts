import type { Page } from 'playwright';
import { defineScene } from '../../src/harness/scene';

// Two columns at the end of the pods list, so the narrowing is visible without moving anything else.
const HIDDEN = ['Restarts', 'Age'];

const columnsButton = (window: Page) => window.getByRole('button', { name: 'Columns', exact: true });

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/workloads/pods');
        await window.getByTestId('pods-table').locator('[data-pod^="checkout-"]').first().waitFor({ timeout: 60_000 });
        await focus(columnsButton(window));
    },
    async run({ window, beat, anchor, goto, click, press }) {
        const menu = window.getByRole('menu');
        const table = window.getByTestId('pods-table');
        anchor('menu', menu);

        await beat('intro');

        await beat('chooser', async () => {
            await click(columnsButton(window));
            await menu.waitFor({ timeout: 30_000 });
        });

        // The menu stays open across toggles, so both columns go from one opening.
        await beat('hide', async () => {
            for (const column of HIDDEN) {
                await click(menu.getByRole('menuitemcheckbox', { name: column, exact: true }));
                await table.getByRole('columnheader', { name: column, exact: true }).waitFor({ state: 'hidden' });
            }
        });

        await beat('kept', async () => {
            await press('Escape');
            await menu.waitFor({ state: 'hidden', timeout: 10_000 });
            await goto('/workloads/deployments');
            await window.getByTestId('deployments-table').waitFor({ timeout: 60_000 });
            await goto('/workloads/pods');
            await table.locator('[data-pod^="checkout-"]').first().waitFor({ timeout: 60_000 });
            await click(columnsButton(window));
            await menu.waitFor({ timeout: 30_000 });
        });

        await beat('outro');
    },
    // The columns come back the way they went, through the chooser, whatever point the run stopped at.
    async cleanup({ window, press }) {
        const menu = window.getByRole('menu');
        await press('Escape');
        await columnsButton(window).click();
        await menu.waitFor({ timeout: 30_000 });
        for (const column of HIDDEN) {
            const item = menu.getByRole('menuitemcheckbox', { name: column, exact: true });
            if ((await item.getAttribute('aria-checked')) === 'false') await item.click();
        }
        await press('Escape');
    },
});
