import { defineScene } from '../../src/harness/scene';

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/overview/summary');
        await window.getByTestId('cluster-summary').waitFor({ timeout: 60_000 });
        await focus(window.getByTestId('cluster-summary'));
    },
    async run({ window, beat, anchor, press, type, click, focus }) {
        const palette = window.getByRole('dialog', { name: 'Quick actions' });
        const deployments = palette.getByRole('option', { name: 'Deployments', exact: true });
        anchor('deployments-option', deployments);
        await beat('intro');
        await beat('open');
        await press('Meta+k');
        await palette.waitFor();
        await type('deploy');
        await deployments.waitFor();
        await beat('search');
        await click(deployments);
        await focus(window.getByTestId('deployments-table'));
        await beat('arrive');
        await beat('outro');
    },
    async cleanup() {},
});
