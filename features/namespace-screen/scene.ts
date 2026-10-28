import { defineScene } from '../../src/harness/scene';

// production is the one demo namespace with a quota and a limit range.
const NAMESPACE = 'production';

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/overview/namespaces/${NAMESPACE}/contents`);
        await window.getByTestId('namespace-counts').waitFor({ timeout: 60_000 });
        await focus(window.getByTestId('namespace-page'));
    },
    async run({ window, beat, anchor, click, glide }) {
        const quotas = window.getByTestId('namespace-quotas');
        const limits = window.getByTestId('namespace-limits');
        anchor('counts', window.getByTestId('namespace-counts'));
        anchor('quotas', quotas);
        anchor('limits', limits);
        await beat('intro');
        await beat('contents');
        await beat('quotas', async () => {
            await click(window.getByRole('tab', { name: 'Budgets' }));
            await quotas.waitFor({ timeout: 60_000 });
        });
        await beat('limits', () => glide(limits));
        await beat('outro');
    },
    async cleanup() {},
});
