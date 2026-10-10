import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
// payments-api's budget allows no disruption, so the eviction is refused and the cluster is left as it was.
const APP = 'payments-api';

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
        await goto(`/workloads/pods/${NAMESPACE}/${pod}`);
        const page = window.getByTestId('pod-page');
        await page.getByRole('button', { name: 'Evict' }).waitFor({ timeout: 60_000 });
        await focus(page);
    },
    async run({ window, beat, anchor, click }) {
        const page = window.getByTestId('pod-page');
        const dialog = window.getByRole('alertdialog');
        const toast = window.locator('[data-sonner-toast]').filter({ hasText: 'disruption budget' });
        anchor('dialog', dialog);
        anchor('toast', toast);
        await beat('intro');
        await click(page.getByRole('button', { name: 'Evict' }));
        await dialog.waitFor({ timeout: 30_000 });
        await beat('evict');
        await click(dialog.getByRole('button', { name: 'Evict' }));
        await toast.waitFor({ timeout: 30_000 });
        await beat('refused');
        await beat('outro');
    },
    async cleanup() {},
});
