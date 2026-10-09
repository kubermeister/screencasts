import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';

export default defineScene({
    // The tab opens by reading each pod's tail in turn; only lines that arrive live are interleaved,
    // so the wait for them happens here, off camera.
    async setup({ goto, window, focus }) {
        await goto(`/workloads/deployments/${NAMESPACE}/checkout`);
        await window.getByTestId('deployment-page').waitFor({ timeout: 30_000 });
        await window.getByRole('tab', { name: 'Logs' }).click();
        const lines = window.getByTestId('log-viewer').getByRole('list', { name: 'Log lines' });
        await lines.getByText('checkout').first().waitFor({ timeout: 90_000 });
        await window.waitForTimeout(20_000);
        await focus(lines);
    },
    async run({ window, beat, anchor, click, type }) {
        const viewer = window.getByTestId('log-viewer');
        const filter = viewer.getByRole('textbox', { name: 'Filter log lines' });
        anchor('log-lines', viewer.getByRole('list', { name: 'Log lines' }));
        anchor('filter', filter);
        await beat('intro');
        await beat('interleaved');
        await beat('highlight');
        await click(viewer.getByRole('button', { name: 'Highlight matches' }));
        await click(filter);
        await type('ERROR');
        await beat('errors');
        await beat('outro');
    },
    async cleanup() {},
});
