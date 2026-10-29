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
        const popover = window.getByRole('dialog');
        anchor('row', row);
        await beat('intro');
        await beat('steppers', async () => {
            await glide(row);
            await click(row.getByRole('button', { name: 'Scale up' }));
        });
        await beat('exact', async () => {
            // The exact-count button only appears while the row is hovered.
            await glide(row);
            await click(row.getByRole('button', { name: /^Scale Deployment/ }));
            await click(popover.getByRole('spinbutton', { name: 'Replicas' }));
            await press('ControlOrMeta+a');
            await type('4');
        });
        // The write itself is what this beat is about, so pressing Scale lands under its callout.
        await beat('written', async () => {
            await click(popover.getByRole('button', { name: 'Scale', exact: true }));
            await row.getByText('4/4').waitFor({ timeout: 60_000 });
        });
        await beat('outro');
    },
    async cleanup({ kubectl }) {
        kubectl(['-n', NAMESPACE, 'scale', `deployment/${DEPLOYMENT}`, `--replicas=${REPLICAS}`]);
    },
});
