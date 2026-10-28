import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
const AUTOSCALER = 'payments-api';
// Only the maximum is changed: a higher minimum would make the autoscaler scale the deployment up.
const BOUNDS = '{"spec":{"minReplicas":2,"maxReplicas":8}}';

export default defineScene({
    async setup({ goto, window, kubectl, focus }) {
        kubectl(['-n', NAMESPACE, 'patch', `hpa/${AUTOSCALER}`, '--type=merge', '-p', BOUNDS]);
        await goto(`/workloads/autoscalers/${NAMESPACE}/${AUTOSCALER}`);
        const page = window.getByTestId('autoscaler-page');
        await page.getByRole('button', { name: 'Edit bounds' }).waitFor({ timeout: 60_000 });
        await focus(page);
    },
    async run({ window, beat, anchor, click, press, type }) {
        const page = window.getByTestId('autoscaler-page');
        const bounds = window.getByTestId('autoscaler-bounds');
        anchor('bounds', bounds);
        // The Overview card's Max row: its label span, then the row around it.
        anchor('max', page.getByText('Max', { exact: true }).locator('..'));
        await beat('intro');
        await beat('open', async () => {
            await click(page.getByRole('button', { name: 'Edit bounds' }));
            await bounds.waitFor({ timeout: 30_000 });
        });
        await beat('fields', async () => {
            await click(bounds.getByLabel('Maximum replicas'));
            await press('ControlOrMeta+a');
            await type('10');
        });
        await beat('saved', async () => {
            await click(bounds.getByRole('button', { name: 'Save' }));
            await page
                .getByText('Max', { exact: true })
                .locator('..')
                .getByText('10', { exact: true })
                .waitFor({ timeout: 30_000 });
        });
        await beat('outro');
    },
    async cleanup({ kubectl }) {
        kubectl(['-n', NAMESPACE, 'patch', `hpa/${AUTOSCALER}`, '--type=merge', '-p', BOUNDS]);
    },
});
