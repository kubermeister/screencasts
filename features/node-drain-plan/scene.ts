import { defineScene } from '../../src/harness/scene';

const NODE = 'orbit-node-01';

export default defineScene({
    async setup({ goto, window }) {
        await goto(`/overview/nodes/${NODE}`);
        await window.getByTestId('node-page').waitFor({ timeout: 30_000 });
        // The page's test id appears before its header actions have rendered.
        await window.getByRole('button', { name: 'Drain', exact: true }).waitFor({ timeout: 90_000 });
    },
    async run({ window, beat, anchor, click }) {
        anchor('drain-plan', window.getByTestId('drain-plan'));
        await beat('intro');
        await beat('drain');
        await click(window.getByRole('button', { name: 'Drain', exact: true }));
        // The plan only: nothing here presses the dialog's Drain.
        await window.getByTestId('drain-plan').waitFor({ timeout: 60_000 });
        await beat('plan');
        await beat('outro');
    },
    async cleanup({ window }) {
        await window.keyboard.press('Escape');
    },
});
