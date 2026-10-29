import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
// legacy-exporter crash-loops on purpose, so its container state and its events always have something to say.
const APP = 'legacy-exporter';

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
            '-o',
            'jsonpath={.items[0].metadata.name}',
        ]).trim();
        await goto(`/workloads/pods/${NAMESPACE}/${pod}/describe`);
        await window.getByTestId('pod-page').getByTestId('describe').waitFor({ timeout: 60_000 });
        await focus(window.getByTestId('pod-page').getByTestId('describe'));
    },
    async run({ window, beat, anchor, glide }) {
        const describe = window.getByTestId('pod-page').getByTestId('describe');
        const events = describe.locator('[data-section="Events"]');
        anchor('container', describe.locator('[data-section="Containers"] [data-block]').first());
        anchor('events', events);
        await beat('intro');
        await beat('containers');
        await beat('events', () => glide(events));
        await beat('copy', () => glide(describe.getByRole('button', { name: 'Copy' })));
        await beat('outro');
    },
    async cleanup() {},
});
