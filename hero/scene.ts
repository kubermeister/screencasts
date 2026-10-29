import { defineScene } from '../src/harness/scene';

const NAMESPACE = 'production';
const DEPLOYMENT = 'checkout';
// The one deployment this repository mutates; here its scale popover is only opened, never confirmed.
const SCALED = 'ingest-worker';
const NODE = 'orbit-node-01';
const SERVICE = 'checkout';
const LOCAL_PORT = '38090';
const SECRET = 'payments-credentials';
const CRD = 'queues.messaging.example.com';
const RELEASE = { namespace: 'platform', name: 'platform-agent' };
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
 * One continuous take through fifteen moments, each the strongest screen of a feature video, so the
 * cursor, the cluster and the timing run on without a cut. Every beat carries the action its caption
 * names, and the next beat's action backs out of whatever the last one opened, so nothing is left in
 * the way. Nothing here writes to the cluster: the scale popover is typed into and dismissed, the
 * manifest edit is discarded, the drain plan is only shown, the forward is stopped in cleanup, and
 * the rollout restart in setup only ever runs once per cluster. overview/scene.ts is this scene with
 * narration; keep the two in step.
 */
export default defineScene({
    async setup({ goto, window, kubectl, focus }) {
        // The rollout comparison needs two revisions; the kept cluster has them after the first run.
        const revision = Number(kubectl(['-n', NAMESPACE, 'get', 'deployment', DEPLOYMENT, '-o', REVISION]).trim());
        if (revision < 2) {
            kubectl(['-n', NAMESPACE, 'rollout', 'restart', `deployment/${DEPLOYMENT}`]);
            kubectl(['-n', NAMESPACE, 'rollout', 'status', `deployment/${DEPLOYMENT}`, '--timeout=180s']);
        }
        await goto('/overview/summary');
        const summary = window.getByTestId('cluster-summary');
        await summary.getByTestId('alerts').waitFor({ timeout: 60_000 });
        await focus(summary);
    },
    async run({ window, beat, goto, click, press, type, glide, kubectl }) {
        const summary = window.getByTestId('cluster-summary');
        const palette = window.getByRole('dialog', { name: 'Quick actions' });
        const deployments = window.getByTestId('deployments-table');
        const deploymentPage = window.getByTestId('deployment-page');
        const manifest = window.getByTestId('manifest-panel');
        const terminal = window.getByTestId('terminal-host');

        await beat('intro');

        await beat('summary', () => glide(summary.getByTestId('alerts')));

        await beat('palette', async () => {
            await press('Meta+k');
            await palette.waitFor();
            await type('deploy');
            await palette.getByRole('option', { name: 'Deployments', exact: true }).waitFor();
        });

        await beat('deployments', async () => {
            await click(palette.getByRole('option', { name: 'Deployments', exact: true }));
            await deployments.locator(`[data-deployment="${SCALED}"]`).waitFor({ timeout: 30_000 });
        });

        // The exact-count button only appears while the row is hovered; the number is typed, not written.
        await beat('scale', async () => {
            const row = deployments.locator(`[data-deployment="${SCALED}"]`);
            await glide(row);
            await click(row.getByRole('button', { name: /^Scale Deployment/ }));
            await click(window.getByRole('dialog').getByRole('spinbutton', { name: 'Replicas' }));
            await press('ControlOrMeta+a');
            await type('4');
        });

        await beat('logs', async () => {
            await press('Escape');
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

        // Leaving the pod ends the shell. The app already compares the two latest revisions.
        await beat('compare', async () => {
            await goto(`/workloads/deployments/${NAMESPACE}/${DEPLOYMENT}`);
            await deploymentPage.waitFor({ timeout: 30_000 });
            await click(window.getByRole('tab', { name: /History/ }));
            await deploymentPage
                .getByTestId('revision-diff')
                .getByText('restartedAt')
                .first()
                .waitFor({ timeout: 60_000 });
        });

        await beat('review', async () => {
            await click(window.getByRole('tab', { name: /Manifest/ }));
            await manifest.waitFor({ timeout: 30_000 });
            await click(manifest.getByRole('button', { name: 'Edit', exact: true }));
            // Edit re-reads the object before the editor opens for writing; keys typed before then are lost.
            await manifest.locator('.cm-content[contenteditable="true"]').waitFor({ timeout: 30_000 });
            await click(manifest.locator('.cm-line', { hasText: /^\s{2}replicas: \d+$/ }).first());
            await press('End');
            await press('Backspace');
            await type('5');
            await click(manifest.getByRole('button', { name: 'Review changes' }));
            await window.getByTestId('manifest-diff').getByText('replicas: 5').first().waitFor({ timeout: 30_000 });
        });

        // Backed all the way out, never saved, before the navigation the discard guard would stop.
        await beat('helm', async () => {
            await click(window.getByRole('button', { name: 'Keep editing' }));
            await click(manifest.getByRole('button', { name: 'Cancel' }));
            await click(window.getByRole('button', { name: 'Discard' }));
            await goto(`/helm/releases/${RELEASE.namespace}/${RELEASE.name}`);
            await window.getByTestId('release-health').waitFor({ timeout: 60_000 });
        });

        await beat('drain', async () => {
            await goto(`/overview/nodes/${NODE}`);
            const drain = window.getByRole('button', { name: 'Drain', exact: true });
            await drain.waitFor({ timeout: 90_000 });
            await click(drain);
            await window.getByTestId('drain-plan').waitFor({ timeout: 60_000 });
        });

        // The plan is only shown: the dialog is dismissed and the node is never drained.
        await beat('forward', async () => {
            await press('Escape');
            await goto(`/network/services/${NAMESPACE}/${SERVICE}/ports`);
            await click(window.getByRole('textbox', { name: 'Local port' }));
            await type(LOCAL_PORT);
            await click(window.getByRole('button', { name: 'Start' }));
            await window.getByTestId('port-forward-status').getByText('Listening').waitFor({ timeout: 30_000 });
        });

        await beat('secret', async () => {
            await goto(`/workloads/secrets/${NAMESPACE}/${SECRET}/data`);
            const keys = window.getByTestId('secret-keys');
            await click(keys.getByRole('button', { name: 'Reveal DATABASE_URL' }));
            await window.getByTestId('value-DATABASE_URL').getByText('postgres://').waitFor({ timeout: 30_000 });
        });

        await beat('custom', async () => {
            await goto(`/addons/instances/${encodeURIComponent(CRD)}`);
            await window
                .getByTestId('instances-table')
                .locator('[data-instance="receipt-emails"]')
                .waitFor({ timeout: 60_000 });
        });

        await beat('more', async () => {
            await goto('/overview/summary');
            await summary.getByTestId('alerts').waitFor({ timeout: 30_000 });
            await glide(window.locator('body'));
        });

        await beat('outro');
    },
    // The forward would listen until the app quits; it is stopped from the top bar, as a user would.
    async cleanup({ window }) {
        await window.getByRole('button', { name: 'Port forwards' }).click();
        await window.getByRole('button', { name: /^Stop forward/ }).click();
        await window.keyboard.press('Escape');
    },
});
