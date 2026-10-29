import { defineScene } from '../../../src/harness/scene';

const NAMESPACE = 'production';

/** The newest running checkout pod: an older one may be shutting down after a restart elsewhere. */
function newestPod(kubectl: (args: string[]) => string, app: string): string {
    return kubectl([
        '-n',
        NAMESPACE,
        'get',
        'pods',
        '-l',
        `app=${app}`,
        '--field-selector=status.phase=Running',
        '--sort-by=.metadata.creationTimestamp',
        '-o',
        'jsonpath={.items[-1:].metadata.name}',
    ]).trim();
}

export default defineScene({
    // The Shell tab is opened in run(), so the session starts on camera.
    async setup({ goto, window, kubectl, focus }) {
        const pod = newestPod(kubectl, 'checkout');
        await goto(`/workloads/pods/${NAMESPACE}/${pod}`);
        await window.getByRole('tab', { name: 'Shell' }).waitFor({ timeout: 60_000 });
        await focus(window.getByTestId('pod-page'));
    },
    async run({ window, beat, anchor, click, type }) {
        const terminal = window.getByTestId('terminal-host');
        anchor('terminal', terminal);
        await beat('intro');
        await beat('open', async () => {
            await click(window.getByRole('tab', { name: 'Shell' }));
            await terminal.locator('.xterm-rows', { hasText: '/ #' }).waitFor({ timeout: 60_000 });
            await click(terminal);
            await type('hostname\n');
        });
        await beat('commands', async () => {
            await type('ls /etc/checkout\n');
            await type('cat /etc/checkout/currency.yaml\n');
            await terminal.getByText('EUR').first().waitFor({ timeout: 30_000 });
        });
        await beat('closes');
        await beat('outro');
    },
    // Leaving the pod is what ends the session.
    async cleanup({ goto }) {
        await goto('/overview/summary');
    },
});
