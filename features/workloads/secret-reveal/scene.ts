import { defineScene } from '../../../src/harness/scene';

const NAMESPACE = 'production';
const SECRET = 'payments-credentials';

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/workloads/secrets/${NAMESPACE}/${SECRET}/data`);
        const keys = window.getByTestId('secret-keys');
        await keys.getByRole('button', { name: 'Reveal DATABASE_URL' }).waitFor({ timeout: 60_000 });
        // The recorded window is not the active one, and an inactive document may not write the clipboard.
        await window.evaluate(() => {
            Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.resolve() });
        });
        await focus(keys);
    },
    async run({ window, beat, anchor, click }) {
        const keys = window.getByTestId('secret-keys');
        const value = window.getByTestId('value-DATABASE_URL');
        const toast = window.locator('[data-sonner-toast]').filter({ hasText: 'copied' });
        anchor('keys', keys);
        anchor('value', value);
        anchor('toast', toast);
        await beat('intro');
        await beat('masked');
        await beat('reveal', async () => {
            await click(keys.getByRole('button', { name: 'Reveal DATABASE_URL' }));
            await value.getByText('postgres://').waitFor({ timeout: 30_000 });
        });
        await beat('copy', async () => {
            await click(keys.getByRole('button', { name: 'Copy GATEWAY_API_KEY' }));
            await toast.waitFor({ timeout: 30_000 });
        });
        await beat('outro');
    },
    async cleanup() {},
});
