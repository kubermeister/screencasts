import { defineScene } from '../../../src/harness/scene';

const NAMESPACE = 'production';
// Not checkout: rollout-compare needs its first two revisions untouched.
const DEPLOYMENT = 'ingest-worker';
const REVISION = 'jsonpath={.metadata.annotations.deployment\\.kubernetes\\.io/revision}';

/** Resumes without failing when the deployment is not paused, unlike `rollout resume`. */
function resume(kubectl: (args: string[]) => string): void {
    kubectl(['-n', NAMESPACE, 'patch', `deployment/${DEPLOYMENT}`, '--type=merge', '-p', '{"spec":{"paused":false}}']);
}

export default defineScene({
    // History needs a second revision to offer a rollback; made off camera, once.
    async setup({ goto, window, kubectl, focus }) {
        resume(kubectl);
        const revision = Number(kubectl(['-n', NAMESPACE, 'get', `deployment/${DEPLOYMENT}`, '-o', REVISION]).trim());
        if (revision < 2) {
            kubectl(['-n', NAMESPACE, 'rollout', 'restart', `deployment/${DEPLOYMENT}`]);
            kubectl(['-n', NAMESPACE, 'rollout', 'status', `deployment/${DEPLOYMENT}`, '--timeout=180s']);
        }
        await goto(`/workloads/deployments/${NAMESPACE}/${DEPLOYMENT}/status`);
        const page = window.getByTestId('deployment-page');
        await page.getByRole('button', { name: 'Pause' }).waitFor({ timeout: 60_000 });
        await focus(page);
    },
    async run({ window, beat, anchor, click, focus }) {
        const page = window.getByTestId('deployment-page');
        const progress = page.getByTestId('rollout-progress');
        const history = page.getByTestId('rollout-history');
        anchor('progress', progress);
        anchor('history', history);
        await beat('intro');
        await beat('pause', async () => {
            await click(page.getByRole('button', { name: 'Pause' }));
            await progress.getByText('Paused').waitFor({ timeout: 30_000 });
        });
        await beat('resume', async () => {
            await click(page.getByRole('button', { name: 'Resume' }));
            await page.getByRole('button', { name: 'Pause' }).waitFor({ timeout: 30_000 });
        });
        await beat('history', async () => {
            await click(window.getByRole('tab', { name: /History/ }));
            // The Roll back button is only shown; pressing it would rewrite the deployment for good.
            await history.getByRole('button', { name: 'Roll back' }).first().waitFor({ timeout: 60_000 });
            await focus(history);
        });
        await beat('outro');
    },
    async cleanup({ kubectl }) {
        resume(kubectl);
    },
});
