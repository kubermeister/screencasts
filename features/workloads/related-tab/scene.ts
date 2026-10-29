import { defineScene } from '../../../src/harness/scene';

const NAMESPACE = 'production';
// checkout: a Service, a mounted ConfigMap, an envFrom Secret, an env var and a ServiceAccount.
const APP = 'checkout';

export default defineScene({
    async setup({ goto, window, kubectl, focus }) {
        const pod = kubectl([
            '-n',
            NAMESPACE,
            'get',
            'pods',
            '-l',
            `app=${APP}`,
            '--field-selector=status.phase=Running',
            '--sort-by=.metadata.creationTimestamp',
            '-o',
            'jsonpath={.items[-1:].metadata.name}',
        ]).trim();
        await goto(`/workloads/pods/${NAMESPACE}/${pod}/related`);
        await window.getByTestId('related-configuration').waitFor({ timeout: 60_000 });
        await focus(window.getByTestId('pod-page'));
    },
    async run({ window, beat, anchor, click, focus }) {
        const configuration = window.getByTestId('related-configuration');
        anchor('traffic', window.getByTestId('related-traffic'));
        anchor('configuration', configuration);
        await beat('intro');
        await beat('traffic');
        await beat('configuration');
        await beat('follow', async () => {
            await click(configuration.getByRole('link', { name: 'checkout-config' }).first());
            await window.getByTestId('configmap-page').waitFor({ timeout: 60_000 });
            await focus(window.getByTestId('configmap-page'));
        });
        await beat('outro');
    },
    async cleanup() {},
});
