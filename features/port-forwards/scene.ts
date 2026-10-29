import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
// payments-api runs nginx, so a connection through the forward is answered; checkout listens on nothing.
const SERVICE = 'payments-api';
// Not the screenshot harness's 38090, so both can run at once.
const LOCAL_PORT = '38190';

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/network/services/${NAMESPACE}/${SERVICE}/ports`);
        await window.getByRole('button', { name: 'Start' }).waitFor({ timeout: 60_000 });
        await focus(window.getByTestId('service-page'));
    },
    async run({ window, beat, anchor, click, type }) {
        const status = window.getByTestId('port-forward-status');
        anchor('status', status);
        anchor('forwards', window.getByTestId('forward-list'));
        await beat('intro');
        await beat('start');
        await click(window.getByRole('textbox', { name: 'Local port' }));
        await type(LOCAL_PORT);
        await click(window.getByRole('button', { name: 'Start' }));
        await status.getByText('Listening').waitFor({ timeout: 30_000 });
        await beat('listening');
        await click(window.getByRole('button', { name: 'Port forwards' }));
        await window.getByTestId('forward-list').waitFor({ timeout: 30_000 });
        await beat('topbar');
        await beat('outro');
    },
    // The listener would stay open until the app quits; the popover is still open here.
    async cleanup({ window }) {
        await window.getByRole('button', { name: /^Stop forward/ }).click();
        await window.keyboard.press('Escape');
    },
});
