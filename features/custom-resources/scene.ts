import { defineScene } from '../../src/harness/scene';

const CRD = 'queues.messaging.example.com';

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/addons/crds/${CRD}`);
        await window.getByRole('link', { name: 'View instances' }).waitFor({ timeout: 60_000 });
        await focus(window.getByTestId('crd-page'));
    },
    async run({ window, beat, anchor, click, focus }) {
        const instances = window.getByTestId('instances-table');
        anchor('instances', instances);
        await beat('intro');
        await beat('definition');
        await click(window.getByRole('link', { name: 'View instances' }));
        await instances.locator('[data-instance="receipt-emails"]').waitFor({ timeout: 60_000 });
        await focus(instances);
        await beat('instances');
        await beat('outro');
    },
    async cleanup() {},
});
