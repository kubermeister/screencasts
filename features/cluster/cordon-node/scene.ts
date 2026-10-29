import { defineScene } from '../../../src/harness/scene';

const NODE = 'orbit-node-01';

/** The drain itself is never started: on the single demo node it would evict everything, DNS included. */
export default defineScene({
    async setup({ goto, window, kubectl, focus }) {
        kubectl(['uncordon', NODE]);
        await goto(`/overview/nodes/${NODE}`);
        // The page's test id appears before its header actions have rendered.
        await window.getByRole('button', { name: 'Cordon', exact: true }).waitFor({ timeout: 90_000 });
        await focus(window.getByTestId('node-page'));
    },
    async run({ window, beat, anchor, click, press }) {
        const page = window.getByTestId('node-page');
        anchor('status', page.getByText('Cordoned', { exact: true }).first());
        anchor('switch', window.getByRole('switch', { name: /emptyDir/ }));
        await beat('intro');
        await beat('cordon', async () => {
            await click(page.getByRole('button', { name: 'Cordon', exact: true }));
            await page.getByText('Cordoned', { exact: true }).first().waitFor({ timeout: 30_000 });
        });
        await beat('drain', async () => {
            await click(page.getByRole('button', { name: 'Drain', exact: true }));
            await window.getByTestId('drain-plan').waitFor({ timeout: 60_000 });
        });
        await beat('uncordon', async () => {
            // The plan is dismissed, never run: the node is only uncordoned.
            await press('Escape');
            await click(page.getByRole('button', { name: 'Uncordon', exact: true }));
            await page.getByRole('button', { name: 'Cordon', exact: true }).waitFor({ timeout: 30_000 });
        });
        await beat('outro');
    },
    async cleanup({ kubectl }) {
        kubectl(['uncordon', NODE]);
    },
});
