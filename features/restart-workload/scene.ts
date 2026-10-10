import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
// Not checkout: rollout-compare needs its first two revisions, and every restart adds one.
const DEPLOYMENT = 'ingest-worker';

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/workloads/deployments/${NAMESPACE}/${DEPLOYMENT}/status`);
        const page = window.getByTestId('deployment-page');
        await page.getByTestId('rollout-progress').waitFor({ timeout: 60_000 });
        await focus(page);
    },
    async run({ window, beat, anchor, click }) {
        const page = window.getByTestId('deployment-page');
        const dialog = window.getByRole('alertdialog');
        anchor('dialog', dialog);
        anchor('progress', page.getByTestId('rollout-progress'));
        await beat('intro');
        await beat('restart');
        await click(page.getByRole('button', { name: 'Restart' }));
        await dialog.waitFor({ timeout: 30_000 });
        await beat('confirm');
        await click(dialog.getByRole('button', { name: 'Restart' }));
        await window
            .getByText(/restarting/)
            .first()
            .waitFor({ timeout: 30_000 });
        await beat('progress');
        await beat('outro');
    },
    // Lets the rollout finish, so the next scene finds the deployment settled.
    async cleanup({ kubectl }) {
        kubectl(['-n', NAMESPACE, 'rollout', 'status', `deployment/${DEPLOYMENT}`, '--timeout=180s']);
    },
});
