import { defineScene } from '../../../src/harness/scene';

// production-quota limits pods, CPU and memory requests and claims; production-limits sets container
// defaults for cpu and memory. Both live in the active namespace, production, so no switch is needed.
const QUOTA_RESOURCE = 'requests.cpu';
const LIMIT_RESOURCE = 'cpu';

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/overview/quotas');
        const quotas = window.getByTestId('quotas-table');
        await quotas.getByRole('row').filter({ hasText: QUOTA_RESOURCE }).waitFor({ timeout: 60_000 });
        await focus(quotas);
    },
    async run({ window, beat, anchor, goto, glide, focus }) {
        const quotas = window.getByTestId('quotas-table');
        const limits = window.getByTestId('limits-table');
        const quotaRow = quotas.getByRole('row').filter({ hasText: QUOTA_RESOURCE });
        const limitRow = limits.getByRole('row').filter({ has: window.getByText(LIMIT_RESOURCE, { exact: true }) });
        anchor('quota-row', quotaRow);
        anchor('limit-row', limitRow);
        await beat('intro');
        await beat('quotas', async () => {
            await glide(quotas);
        });
        await beat('used', async () => {
            await glide(quotaRow);
        });
        await beat('limits', async () => {
            await goto('/overview/limits');
            await limitRow.waitFor({ timeout: 60_000 });
            await focus(limits);
        });
        await beat('defaults', async () => {
            await glide(limitRow);
        });
        await beat('outro');
    },
    async cleanup() {},
});
