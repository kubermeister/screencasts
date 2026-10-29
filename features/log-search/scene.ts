import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
const DEPLOYMENT = 'checkout';

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

/**
 * One pod's Logs tab, so the container picker names a container rather than the followed pods.
 * Nothing here writes to the cluster: the search and the pickers only change what the console
 * reads.
 */
export default defineScene({
    async setup({ goto, window, focus, kubectl }) {
        await goto(`/workloads/pods/${NAMESPACE}/${newestPod(kubectl)}`);
        await window.getByTestId('pod-page').waitFor({ timeout: 30_000 });
        await window.getByRole('tab', { name: 'Logs' }).click();
        const lines = window.getByTestId('log-viewer').getByRole('list', { name: 'Log lines' });
        await lines.getByText(DEPLOYMENT).first().waitFor({ timeout: 60_000 });
        await focus(lines);
    },
    async run({ window, beat, anchor, click, press, type }) {
        const viewer = window.getByTestId('log-viewer');
        const lines = viewer.getByRole('list', { name: 'Log lines' });
        const filter = viewer.getByRole('textbox', { name: 'Filter log lines' });
        const matchCase = viewer.getByRole('button', { name: 'Aa', exact: true });
        const regex = viewer.getByRole('button', { name: '.*', exact: true });
        const container = viewer.getByRole('button', { name: 'Container', exact: true });
        const since = viewer.getByRole('button', { name: 'Since', exact: true });
        anchor('filter', filter);
        anchor('case', matchCase);
        anchor('regex', regex);
        anchor('container', container);
        anchor('since', since);

        await beat('intro');

        await beat('text', async () => {
            await click(filter);
            await type('error');
            await lines.getByText(/ERROR/).first().waitFor({ timeout: 30_000 });
        });

        // The log writes ERROR in capitals, so a case-sensitive "error" leaves the console empty.
        await beat('case', async () => {
            await click(matchCase);
            await lines.getByText(/ERROR/).first().waitFor({ state: 'hidden', timeout: 30_000 });
        });

        await beat('pattern', async () => {
            await click(matchCase);
            await click(filter);
            await press('ControlOrMeta+a');
            await type('(ERROR|WARN)');
        });

        await beat('regex', async () => {
            await click(regex);
            await lines.getByText(/WARN/).first().waitFor({ timeout: 30_000 });
        });

        // The menu stays open under the callout; the next beat closes it.
        await beat('container', async () => {
            await click(container);
            await window.getByRole('menuitem', { name: DEPLOYMENT }).waitFor();
        });

        await beat('since', async () => {
            await press('Escape');
            await click(since);
            const hour = window.getByRole('menuitem', { name: '1 hour', exact: true });
            await hour.waitFor();
            await click(hour);
            await lines.getByText(/WARN/).first().waitFor({ timeout: 30_000 });
        });

        await beat('outro');
    },
    async cleanup() {},
});
