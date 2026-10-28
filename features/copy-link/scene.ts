import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
const DEPLOYMENT = 'checkout';

declare global {
    var __kmCopied: string | undefined;
}

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/workloads/deployments/${NAMESPACE}/${DEPLOYMENT}/history`);
        const page = window.getByTestId('deployment-page');
        await page.getByRole('button', { name: 'Copy link' }).waitFor({ timeout: 60_000 });
        // The recorded window is not the active one, and an inactive document may not write the
        // clipboard; the link is kept so the scene can open it the way the OS would.
        await window.evaluate(() => {
            Object.defineProperty(navigator.clipboard, 'writeText', {
                value: (text: string) => {
                    globalThis.__kmCopied = text;
                    return Promise.resolve();
                },
            });
        });
        await focus(page);
    },
    async run({ window, app, beat, anchor, click, goto }) {
        const page = window.getByTestId('deployment-page');
        anchor('toast', window.locator('[data-sonner-toast]').filter({ hasText: 'Link copied' }));
        anchor('page', page);
        await beat('intro');
        let link: string | undefined;
        await beat('copy', async () => {
            await click(page.getByRole('button', { name: 'Copy link' }));
            await window.locator('[data-sonner-toast]').filter({ hasText: 'Link copied' }).waitFor({ timeout: 30_000 });
            link = await window.evaluate(() => globalThis.__kmCopied);
            if (!link) throw new Error('Copy link put nothing on the clipboard');
        });
        // Leaving the page first, so the link visibly brings it back.
        await beat('open', async () => {
            await goto('/overview/summary');
            await window.getByTestId('cluster-summary').waitFor({ timeout: 60_000 });
            // What the OS does when a kubermeister:// link is opened; main handles it the same on every platform.
            await app.evaluate(({ app: electron }, url) => {
                electron.emit('open-url', { preventDefault() {} }, url);
            }, link);
            await page.getByRole('tab', { name: /History/, selected: true }).waitFor({ timeout: 60_000 });
        });
        await beat('landed');
        await beat('outro');
    },
    async cleanup() {},
});
