import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
const REVISION = 'jsonpath={.metadata.annotations.deployment\\.kubernetes\\.io/revision}';

export default defineScene({
    // The demo cluster is seeded with one rollout; a restart makes the second one to compare with.
    // It runs here, off camera, and only once: a kept cluster already has it.
    async setup({ goto, window, kubectl, focus }) {
        const revision = Number(kubectl(['-n', NAMESPACE, 'get', 'deployment', 'checkout', '-o', REVISION]).trim());
        if (revision < 2) {
            kubectl(['-n', NAMESPACE, 'rollout', 'restart', 'deployment/checkout']);
            kubectl(['-n', NAMESPACE, 'rollout', 'status', 'deployment/checkout', '--timeout=180s']);
        }
        await goto(`/workloads/deployments/${NAMESPACE}/checkout`);
        await focus(window.getByTestId('deployment-page'));
    },
    async run({ window, beat, anchor, click, focus }) {
        const page = window.getByTestId('deployment-page');
        anchor('revision-diff', page.getByTestId('revision-diff'));
        await beat('intro');
        await beat('history');
        await click(window.getByRole('tab', { name: /History/ }));
        await page.getByTestId('rollout-history').locator('[data-revision="2"]').waitFor({ timeout: 60_000 });
        await focus(page.getByTestId('rollout-history'));
        // Both pickers are chosen rather than left at their defaults, which can both sit on #1 when
        // the tab opens before the second revision has loaded, and an empty diff shows nothing.
        await beat('pick');
        await click(page.getByRole('combobox', { name: 'From revision' }));
        await click(window.getByRole('option', { name: '#1' }));
        await click(page.getByRole('combobox', { name: 'To revision' }));
        await click(window.getByRole('option', { name: '#2' }));
        await page.getByTestId('revision-diff').getByText('restartedAt').first().waitFor({ timeout: 30_000 });
        await beat('diff');
        await beat('outro');
    },
    async cleanup() {},
});
