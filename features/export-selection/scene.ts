import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineScene } from '../../src/harness/scene';

const ROWS = ['checkout', 'payments-api'];

export default defineScene({
    async setup({ goto, window, app, focus }) {
        // The save dialog is native and never on camera: it is answered from main with a scratch path.
        await app.evaluate(
            ({ dialog }, filePath) => {
                dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath });
            },
            join(tmpdir(), 'km-screencasts-export.yaml'),
        );
        await goto('/workloads/deployments');
        const table = window.getByTestId('deployments-table');
        await table.locator(`[data-deployment="${ROWS[0]}"]`).waitFor({ timeout: 60_000 });
        await focus(table);
    },
    async run({ window, beat, anchor, click }) {
        const table = window.getByTestId('deployments-table');
        anchor('selection-bar', window.getByTestId('selection-bar'));
        anchor('menu', window.getByRole('menu'));
        await beat('intro');
        for (const row of ROWS) {
            await click(table.locator(`[data-deployment="${row}"]`).getByRole('checkbox', { name: 'Select row' }));
        }
        await window.getByTestId('selection-bar').waitFor({ timeout: 30_000 });
        await beat('select');
        await click(window.getByTestId('selection-bar').getByRole('button', { name: /^Export/ }));
        await window.getByRole('menu').waitFor({ timeout: 30_000 });
        await beat('menu');
        await click(window.getByRole('menuitem', { name: 'Cleaned for another cluster' }));
        await window.locator('[data-sonner-toast]').filter({ hasText: 'saved' }).waitFor({ timeout: 30_000 });
        await beat('saved');
        await beat('outro');
    },
    async cleanup({ window }) {
        await window.getByTestId('selection-bar').getByRole('button', { name: 'Clear' }).click();
    },
});
