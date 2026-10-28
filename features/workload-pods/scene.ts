import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
// checkout runs three replicas, so the Pods tab has a list to point at.
const DEPLOYMENT = 'checkout';
const REPLICAS = 3;

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/workloads/deployments/${NAMESPACE}/${DEPLOYMENT}`);
        const page = window.getByTestId('deployment-page');
        await page.getByRole('tab', { name: 'Pods', exact: true }).waitFor({ timeout: 60_000 });
        await focus(page);
    },
    async run({ window, beat, anchor, click, focus }) {
        const deploymentPage = window.getByTestId('deployment-page');
        const podPage = window.getByTestId('pod-page');
        const ownedPods = deploymentPage.getByTestId('owned-pods');
        const ownerChain = podPage.getByTestId('owner-chain');
        anchor('owned-pods', ownedPods);
        anchor('owner-chain', ownerChain);
        await beat('intro');
        await beat('pods', async () => {
            await click(deploymentPage.getByRole('tab', { name: 'Pods', exact: true }));
            await ownedPods
                .locator('[data-pod]')
                .nth(REPLICAS - 1)
                .waitFor({ timeout: 60_000 });
        });
        await beat('open', async () => {
            await click(ownedPods.locator('[data-pod]').first().getByRole('link'));
            await ownerChain.waitFor({ timeout: 60_000 });
            await focus(podPage);
        });
        await beat('owner');
        await beat('back', async () => {
            await click(ownerChain.getByRole('link', { name: DEPLOYMENT, exact: true }));
            await deploymentPage.waitFor({ timeout: 60_000 });
            await focus(deploymentPage);
        });
        await beat('outro');
    },
    async cleanup() {},
});
