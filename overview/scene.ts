import { defineScene } from '../src/harness/scene';

const NAMESPACE = 'production';
const NODE = 'orbit-node-01';
const REVISION = 'jsonpath={.metadata.annotations.deployment\\.kubernetes\\.io/revision}';

/**
 * The strongest beat of each feature, filmed as one scene rather than stitched from their videos, so
 * the cursor, the cluster and the timing run continuously. Manifest review comes last because its
 * unsaved edit would stop any later navigation on the discard guard; cleanup backs out of it.
 */
export default defineScene({
    async setup({ goto, window, kubectl }) {
        const revision = Number(kubectl(['-n', NAMESPACE, 'get', 'deployment', 'checkout', '-o', REVISION]).trim());
        if (revision < 2) {
            kubectl(['-n', NAMESPACE, 'rollout', 'restart', 'deployment/checkout']);
            kubectl(['-n', NAMESPACE, 'rollout', 'status', 'deployment/checkout', '--timeout=180s']);
        }
        await goto('/overview/summary');
        await window.getByTestId('cluster-summary').getByTestId('alerts').waitFor({ timeout: 60_000 });
    },
    async run({ window, beat, anchor, goto, click, press, type, glide }) {
        const deploymentPage = window.getByTestId('deployment-page');
        const manifest = window.getByTestId('manifest-panel');
        anchor('alerts', window.getByTestId('cluster-summary').getByTestId('alerts'));
        anchor('revision-diff', deploymentPage.getByTestId('revision-diff'));
        anchor('drain-plan', window.getByTestId('drain-plan'));
        anchor('manifest-diff', window.getByTestId('manifest-diff'));

        await beat('intro');
        await beat('summary');
        await glide(window.getByTestId('cluster-summary').getByTestId('alerts'));

        await beat('palette');
        await press('Meta+k');
        const palette = window.getByRole('dialog', { name: 'Quick actions' });
        await palette.waitFor();
        await type('deploy');
        await click(palette.getByRole('option', { name: 'Deployments', exact: true }));
        await window.getByTestId('deployments-table').waitFor({ timeout: 30_000 });
        await beat('deployments');

        await goto(`/workloads/deployments/${NAMESPACE}/checkout`);
        await deploymentPage.waitFor({ timeout: 30_000 });
        await click(window.getByRole('tab', { name: 'Logs' }));
        await window
            .getByTestId('log-viewer')
            .getByRole('list', { name: 'Log lines' })
            .getByText('checkout')
            .first()
            .waitFor({ timeout: 90_000 });
        await beat('logs');

        await click(window.getByRole('tab', { name: /History/ }));
        await deploymentPage.getByTestId('rollout-history').locator('[data-revision="2"]').waitFor({ timeout: 60_000 });
        await click(deploymentPage.getByRole('combobox', { name: 'From revision' }));
        await click(window.getByRole('option', { name: '#1' }));
        await click(deploymentPage.getByRole('combobox', { name: 'To revision' }));
        await click(window.getByRole('option', { name: '#2' }));
        await deploymentPage.getByTestId('revision-diff').getByText('restartedAt').first().waitFor({ timeout: 30_000 });
        await beat('compare');

        await goto(`/overview/nodes/${NODE}`);
        const drain = window.getByRole('button', { name: 'Drain', exact: true });
        await drain.waitFor({ timeout: 90_000 });
        await click(drain);
        await window.getByTestId('drain-plan').waitFor({ timeout: 60_000 });
        await beat('drain');
        await press('Escape');

        await goto(`/workloads/deployments/${NAMESPACE}/checkout`);
        await deploymentPage.waitFor({ timeout: 30_000 });
        await click(window.getByRole('tab', { name: /Manifest/ }));
        await manifest.waitFor({ timeout: 30_000 });
        await click(manifest.getByRole('button', { name: 'Edit', exact: true }));
        await manifest.locator('.cm-content[contenteditable="true"]').waitFor({ timeout: 30_000 });
        await click(manifest.locator('.cm-line', { hasText: /^\s{2}replicas: \d+$/ }).first());
        await press('End');
        await press('Backspace');
        await type('5');
        await click(manifest.getByRole('button', { name: 'Review changes' }));
        await window.getByTestId('manifest-diff').getByText('replicas: 5').first().waitFor({ timeout: 30_000 });
        await beat('review');
        await beat('outro');
    },
    // The edit is never saved: backed all the way out so closing does not stop on the discard guard.
    async cleanup({ window }) {
        await window.getByRole('button', { name: 'Keep editing' }).click();
        await window.getByTestId('manifest-panel').getByRole('button', { name: 'Cancel' }).click();
        await window.getByRole('button', { name: 'Discard' }).click();
    },
});
