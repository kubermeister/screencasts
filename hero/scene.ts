import { defineScene } from '../src/harness/scene';

const NAMESPACE = 'production';
const DEPLOYMENT = 'checkout';
const NODE = 'orbit-node-01';
const REVISION = 'jsonpath={.metadata.annotations.deployment\\.kubernetes\\.io/revision}';

/** The newest running pod of the deployment: an older one may still be shutting down after a restart. */
function newestPod(kubectl: (args: string[]) => string): string {
    return kubectl([
        '-n',
        NAMESPACE,
        'get',
        'pods',
        '-l',
        `app=${DEPLOYMENT}`,
        '--field-selector=status.phase=Running',
        '--sort-by=.metadata.creationTimestamp',
        '-o',
        'jsonpath={.items[-1:].metadata.name}',
    ]).trim();
}

/**
 * The website's main video: the landing page's promise, then one continuous tour of the moments
 * that keep it. Every beat carries the action its text is about, so a screen changes under the text
 * that describes it. It opens and closes on the cluster summary, so the poster frame and the last
 * frame are the same screen. Nothing here writes to the cluster: the drain plan is dismissed, the
 * shell ends when the scene leaves the pod, and the rollout restart in setup only runs once per
 * cluster.
 */
export default defineScene({
    async setup({ goto, window, kubectl }) {
        // The rollout comparison needs two revisions; the kept cluster has them after the first run.
        const revision = Number(kubectl(['-n', NAMESPACE, 'get', 'deployment', DEPLOYMENT, '-o', REVISION]).trim());
        if (revision < 2) {
            kubectl(['-n', NAMESPACE, 'rollout', 'restart', `deployment/${DEPLOYMENT}`]);
            kubectl(['-n', NAMESPACE, 'rollout', 'status', `deployment/${DEPLOYMENT}`, '--timeout=180s']);
        }
        await goto('/overview/summary');
        await window.getByTestId('cluster-summary').getByTestId('alerts').waitFor({ timeout: 60_000 });
    },
    async run({ window, beat, anchor, goto, click, press, type, glide, kubectl }) {
        const summary = window.getByTestId('cluster-summary');
        const deploymentPage = window.getByTestId('deployment-page');
        const palette = window.getByRole('dialog', { name: 'Quick actions' });
        const terminal = window.getByTestId('terminal-host');
        anchor('alerts', summary.getByTestId('alerts'));
        anchor('rollout-history', deploymentPage.getByTestId('rollout-history'));
        anchor('revision-diff', deploymentPage.getByTestId('revision-diff'));
        anchor('drain-plan', window.getByTestId('drain-plan'));

        await beat('intro');

        await beat('summary', async () => {
            await glide(summary.getByTestId('alerts'));
        });

        await beat('palette', async () => {
            await press('Meta+k');
            await palette.waitFor();
            await type('deploy');
            await palette.getByRole('option', { name: 'Deployments', exact: true }).waitFor();
        });

        await beat('deployments', async () => {
            await click(palette.getByRole('option', { name: 'Deployments', exact: true }));
            await window.getByTestId('deployments-table').waitFor({ timeout: 30_000 });
        });

        await beat('logs', async () => {
            await goto(`/workloads/deployments/${NAMESPACE}/${DEPLOYMENT}`);
            await deploymentPage.waitFor({ timeout: 30_000 });
            await click(window.getByRole('tab', { name: 'Logs' }));
            await window
                .getByTestId('log-viewer')
                .getByRole('list', { name: 'Log lines' })
                .getByText(DEPLOYMENT)
                .first()
                .waitFor({ timeout: 90_000 });
        });

        await beat('shell', async () => {
            await goto(`/workloads/pods/${NAMESPACE}/${newestPod(kubectl)}`);
            const shellTab = window.getByRole('tab', { name: 'Shell' });
            await shellTab.waitFor({ timeout: 60_000 });
            await click(shellTab);
            await terminal.locator('.xterm-rows', { hasText: '/ #' }).waitFor({ timeout: 60_000 });
            await click(terminal);
            await type('hostname\n');
        });

        // Leaving the pod ends the shell session.
        await beat('history', async () => {
            await goto(`/workloads/deployments/${NAMESPACE}/${DEPLOYMENT}`);
            await deploymentPage.waitFor({ timeout: 30_000 });
            await click(window.getByRole('tab', { name: /History/ }));
            await deploymentPage
                .getByTestId('rollout-history')
                .locator('[data-revision="2"]')
                .waitFor({ timeout: 60_000 });
        });

        // The app already compares the two latest revisions; the cursor only goes down to the diff.
        await beat('compare', async () => {
            await deploymentPage
                .getByTestId('revision-diff')
                .getByText('restartedAt')
                .first()
                .waitFor({ timeout: 30_000 });
            await glide(deploymentPage.getByTestId('revision-diff'));
        });

        await beat('drain', async () => {
            await goto(`/overview/nodes/${NODE}`);
            const drain = window.getByRole('button', { name: 'Drain', exact: true });
            await drain.waitFor({ timeout: 90_000 });
            await click(drain);
            await window.getByTestId('drain-plan').waitFor({ timeout: 60_000 });
        });

        // The plan is only shown; the dialog is dismissed and the node is never drained.
        await beat('promise', async () => {
            await press('Escape');
            await goto('/overview/summary');
            await summary.getByTestId('alerts').waitFor({ timeout: 30_000 });
            await glide(window.locator('body'));
        });

        await beat('outro');
    },
    async cleanup() {},
});
