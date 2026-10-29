import { defineScene } from '../../../src/harness/scene';

const NAMESPACE = 'production';
const DEPLOYMENT = 'checkout';

export default defineScene({
    // The tab opens by reading each pod's tail in turn; only lines that arrive live are interleaved,
    // so the wait for them happens here, off camera.
    async setup({ goto, window, focus }) {
        await goto(`/workloads/deployments/${NAMESPACE}/${DEPLOYMENT}`);
        await window.getByTestId('deployment-page').waitFor({ timeout: 30_000 });
        await window.getByRole('tab', { name: 'Logs' }).click();
        const lines = window.getByTestId('log-viewer').getByRole('list', { name: 'Log lines' });
        await lines.getByText(DEPLOYMENT).first().waitFor({ timeout: 90_000 });
        await window.waitForTimeout(20_000);
        // The recorded window is not the active one, and an inactive document may not write the clipboard.
        await window.evaluate(() => {
            Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.resolve() });
        });
        await focus(lines);
    },
    async run({ window, beat, anchor, click, glide }) {
        const viewer = window.getByTestId('log-viewer');
        const lines = viewer.getByRole('list', { name: 'Log lines' });
        const display = viewer.getByRole('group', { name: 'Line display' });
        const toast = window.locator('[data-sonner-toast]').filter({ hasText: 'copied' });
        anchor('log-lines', lines);
        anchor('display', display);
        anchor('toast', toast);

        await beat('intro');

        await beat('labels', async () => {
            await glide(lines);
        });

        await beat('pod-names', async () => {
            await click(display.getByRole('button', { name: 'Show pod names' }));
            await display.locator('button[aria-label="Show pod names"][aria-pressed="false"]').waitFor();
        });

        await beat('timestamps', async () => {
            await click(display.getByRole('button', { name: 'Show timestamps' }));
            await display.locator('button[aria-label="Show timestamps"][aria-pressed="true"]').waitFor();
        });

        await beat('wrap', async () => {
            await click(display.getByRole('button', { name: 'Wrap long lines' }));
            await display.locator('button[aria-label="Wrap long lines"][aria-pressed="true"]').waitFor();
        });

        await beat('copy', async () => {
            await click(viewer.getByRole('button', { name: 'Copy logs' }));
            await toast.waitFor({ timeout: 30_000 });
        });

        await beat('outro');
    },
    // The display options live in localStorage, and the app starts from a fresh user-data directory
    // every launch, so the toggles are not kept.
    async cleanup() {},
});
