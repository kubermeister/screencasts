import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
// checkout: a Deployment, so its pods answer to a ReplicaSet that answers to the Deployment.
const DEPLOYMENT = 'checkout';
// A claim that stays Pending keeps the protection finalizer the API server gives every claim.
const CLAIM = 'checkout-uploads';
const CLAIM_FINALIZER = 'kubernetes.io/pvc-protection';

/** The newest running pod of the deployment: an older one may still be shutting down after a restart. */
function newestPod(kubectl: (args: string[]) => string): string {
    return kubectl([
        '-n',
        NAMESPACE,
        'get',
        'pods',
        '-l',
        `app=${DEPLOYMENT}`,
        '--field-selector=status.phase=Running',
        '--sort-by=.metadata.creationTimestamp',
        '-o',
        'jsonpath={.items[-1:].metadata.name}',
    ]).trim();
}

export default defineScene({
    async setup({ goto, window, kubectl, focus }) {
        await goto(`/workloads/pods/${NAMESPACE}/${newestPod(kubectl)}/labels`);
        const podPage = window.getByTestId('pod-page');
        await podPage
            .getByTestId('object-meta')
            .getByRole('link', { name: /^ReplicaSet\// })
            .waitFor({ timeout: 60_000 });
        await focus(podPage);
    },
    async run({ window, beat, anchor, goto, click, glide, focus }) {
        const podMeta = window.getByTestId('pod-page').getByTestId('object-meta');
        const replicaSetPage = window.getByTestId('replicaset-page');
        const replicaSetMeta = replicaSetPage.getByTestId('object-meta');
        const claimPage = window.getByTestId('claim-page');
        const claimMeta = claimPage.getByTestId('object-meta');
        anchor('pod-owner', podMeta);
        anchor('replicaset-owner', replicaSetMeta);
        anchor('finalizers', claimMeta);
        await beat('intro');
        await beat('owner', async () => {
            await glide(podMeta);
        });
        await beat('follow', async () => {
            await click(podMeta.getByRole('link', { name: /^ReplicaSet\// }));
            await replicaSetPage.waitFor({ timeout: 60_000 });
            await click(replicaSetPage.getByRole('tab', { name: 'Labels' }));
            await replicaSetMeta.getByRole('link', { name: `Deployment/${DEPLOYMENT}` }).waitFor({ timeout: 60_000 });
            await focus(replicaSetMeta);
        });
        await beat('finalizers', async () => {
            await goto(`/storage/claims/${NAMESPACE}/${CLAIM}/labels`);
            await claimMeta.getByText(CLAIM_FINALIZER).waitFor({ timeout: 60_000 });
            await focus(claimMeta);
            await glide(claimMeta);
        });
        await beat('outro');
    },
    async cleanup() {},
});
