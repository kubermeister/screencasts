import { defineScene } from '../src/harness/scene';

/**
 * A wordless loop: it starts and ends on the cluster summary with the cursor in the middle of the
 * window, so the last frame cuts back to the first without a jump. The recording adds 0.5 s before
 * the first beat and 1.5 s after the last; the holds bring the whole to about 20 s.
 */
export default defineScene({
    async setup({ goto, window }) {
        await goto('/overview/summary');
        await window.getByTestId('cluster-summary').getByTestId('alerts').waitFor({ timeout: 60_000 });
    },
    async run({ window, beat, glide, click }) {
        const summary = window.getByTestId('cluster-summary');
        const sidebar = window.getByRole('navigation', { name: 'Main' });
        await beat('rest');
        await glide(summary.getByText('Workload health'));
        await beat('charts');
        await click(sidebar.getByRole('link', { name: 'Pods', exact: true }));
        await window.getByTestId('pods-table').waitFor({ timeout: 30_000 });
        await beat('pods');
        await click(sidebar.getByRole('link', { name: 'Deployments', exact: true }));
        await window.getByTestId('deployments-table').waitFor({ timeout: 30_000 });
        await beat('deployments');
        await click(sidebar.getByRole('link', { name: 'Cluster summary', exact: true }));
        await summary.getByTestId('alerts').waitFor({ timeout: 30_000 });
        // The body's centre is the window's centre, where the cursor rested in the first frame.
        await glide(window.locator('body'));
        await beat('home');
    },
    async cleanup() {},
});
