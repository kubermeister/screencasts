import { defineScene } from '../../src/harness/scene';

/** The demo repository is written into each launch's settings when `helm` is on PATH. */
export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/settings/charts');
        await window.getByTestId('repository-platform').waitFor({ timeout: 60_000 });
        await focus(window.getByTestId('chart-repositories'));
    },
    async run({ window, beat, anchor, click, type }) {
        const dialog = window.getByRole('alertdialog');
        anchor('repository', window.getByTestId('repository-platform'));
        anchor('add-dialog', dialog);
        await beat('intro');
        await beat('sources');
        await beat('add', async () => {
            await click(window.getByTestId('add-chart-repository'));
            await dialog.waitFor({ timeout: 30_000 });
            await click(dialog.getByRole('radio', { name: /OCI registry/ }));
            await click(dialog.getByRole('textbox', { name: 'Repository name' }));
            await type('podinfo');
            await click(dialog.getByRole('textbox', { name: 'Repository URL' }));
            await type('oci://ghcr.io/stefanprodan/charts');
        });
        await beat('credentials', async () => {
            await click(dialog.getByRole('textbox', { name: 'Username' }));
            await type('deploy-bot');
        });
        await beat('outro');
    },
    // Add would read the registry over the network; the dialog is dismissed instead.
    async cleanup({ window }) {
        await window.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    },
});
