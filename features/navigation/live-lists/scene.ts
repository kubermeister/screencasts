import { defineScene } from '../../../src/harness/scene';

const NAMESPACE = 'production';
// The one deployment this repository mutates, so the kept cluster's other workloads keep their ages.
const DEPLOYMENT = 'ingest-worker';
const REPLICAS = 'jsonpath={.spec.replicas}';

/** The count the deployment had before the scene touched it, restored in cleanup. */
let replicasBefore = 0;

/**
 * One change from outside the app, watched arriving in the list. The scale is undone in cleanup,
 * back to whatever count setup found, so a run leaves the cluster as it was.
 */
export default defineScene({
    async setup({ goto, window, focus, kubectl }) {
        replicasBefore = Number(kubectl(['-n', NAMESPACE, 'get', 'deployment', DEPLOYMENT, '-o', REPLICAS]).trim());
        // The change must land on a settled row: n of n ready, with no rollout still in flight.
        kubectl(['-n', NAMESPACE, 'rollout', 'status', `deployment/${DEPLOYMENT}`, '--timeout=180s']);
        await goto('/workloads/deployments');
        const table = window.getByTestId('deployments-table');
        const row = table.locator(`[data-deployment="${DEPLOYMENT}"]`);
        await row.getByText(`${replicasBefore}/${replicasBefore}`).waitFor({ timeout: 60_000 });
        await focus(table);
    },
    async run({ window, beat, anchor, goto, glide, kubectl }) {
        const row = window.getByTestId('deployments-table').locator(`[data-deployment="${DEPLOYMENT}"]`);
        const pods = window.getByTestId('pods-table');
        const after = replicasBefore + 1;
        anchor('row', row);
        // The first pod's CPU meter: a value the metrics server keeps changing.
        anchor('usage', pods.getByRole('progressbar', { name: 'CPU usage' }).first());

        await beat('intro');

        await beat('scale', async () => {
            await glide(row);
            kubectl(['-n', NAMESPACE, 'scale', `deployment/${DEPLOYMENT}`, `--replicas=${after}`]);
        });

        await beat('ready', async () => {
            await row.getByText(`${after}/${after}`).waitFor({ timeout: 120_000 });
        });

        await beat('usage', async () => {
            await goto('/workloads/pods');
            await pods.locator('[data-pod^="checkout-"]').first().waitFor({ timeout: 60_000 });
            await pods.getByRole('progressbar', { name: 'CPU usage' }).first().waitFor({ timeout: 90_000 });
        });

        await beat('outro');
    },
    async cleanup({ kubectl }) {
        kubectl(['-n', NAMESPACE, 'scale', `deployment/${DEPLOYMENT}`, `--replicas=${replicasBefore}`]);
    },
});
