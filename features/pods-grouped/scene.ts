import { defineScene } from '../../src/harness/scene';

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/workloads/pods');
        const table = window.getByTestId('pods-table');
        await table.locator('[data-pod^="checkout-"]').first().waitFor({ timeout: 60_000 });
        await focus(table);
    },
    async run({ window, beat, anchor, click }) {
        const table = window.getByTestId('pods-table');
        // A Deployment's pods belong to its ReplicaSet, which is what the heading names.
        const group = table.locator('[data-group^="ReplicaSet/checkout-"]');
        anchor('group', group);
        await beat('intro');
        await beat('picker');
        await click(window.getByRole('combobox', { name: 'Group pods' }));
        await click(window.getByRole('option', { name: 'By owner' }));
        await group.waitFor({ timeout: 30_000 });
        await beat('grouped');
        await beat('outro');
    },
    async cleanup() {},
});
