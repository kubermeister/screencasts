import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
// ingest-worker: no autoscaler to undo the scaling, and no other scene depends on its replica count.
const DEPLOYMENT = 'ingest-worker';
const REPLICAS = 2;

export default defineScene({
    async setup({ goto, window, kubectl, focus }) {
        kubectl(['-n', NAMESPACE, 'scale', `deployment/${DEPLOYMENT}`, `--replicas=${REPLICAS}`]);
        await goto('/workloads/deployments');
        const table = window.getByTestId('deployments-table');
        await table.locator(`[data-deployment="${DEPLOYMENT}"]`).waitFor({ timeout: 60_000 });
        await focus(table);
    },
    async run({ window, beat, anchor, click, glide, press, type }) {
        const row = window.getByTestId('deployments-table').locator(`[data-deployment="${DEPLOYMENT}"]`);
        anchor('row', row);
        await beat('intro');
        await beat('steppers');
        await glide(row);
        await click(row.getByRole('button', { name: 'Scale up' }));
        await beat('exact');
        // The exact-count button only appears while the row is hovered.
        await glide(row);
        await click(row.getByRole('button', { name: /^Scale Deployment/ }));
        const popover = window.getByRole('dialog');
        await click(popover.getByRole('spinbutton', { name: 'Replicas' }));
        await press('ControlOrMeta+a');
        await type('4');
        await click(popover.getByRole('button', { name: 'Scale', exact: true }));
        await row.getByText('4/4').waitFor({ timeout: 60_000 });
        await beat('written');
        await beat('outro');
    },
    async cleanup({ kubectl }) {
        kubectl(['-n', NAMESPACE, 'scale', `deployment/${DEPLOYMENT}`, `--replicas=${REPLICAS}`]);
    },
});
