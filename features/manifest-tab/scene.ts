import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
const CONFIG_MAP = 'checkout-config';

/** Read-only throughout: Download is only pointed at, since saving a file opens a native dialog. */
export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/workloads/configmaps/${NAMESPACE}/${CONFIG_MAP}`);
        await window.getByTestId('configmap-page').waitFor({ timeout: 30_000 });
        await window.getByRole('tab', { name: /Manifest/ }).click();
        const panel = window.getByTestId('manifest-panel');
        await panel
            .locator('.cm-line', { hasText: /^kind: ConfigMap$/ })
            .first()
            .waitFor({ timeout: 30_000 });
        await focus(panel);
    },
    async run({ window, beat, anchor, glide }) {
        const panel = window.getByTestId('manifest-panel');
        const dataBlock = panel.locator('.cm-line', { hasText: /^\s{2}currency\.yaml: [|>]/ }).first();
        anchor('yaml', panel.locator('.cm-content'));
        anchor('data', dataBlock);
        anchor('download', panel.getByRole('button', { name: 'Download', exact: true }));

        await beat('intro');

        await beat('manifest', async () => {
            await glide(panel.locator('.cm-line', { hasText: /^data:$/ }).first());
        });

        await beat('data', async () => {
            await glide(dataBlock);
        });

        await beat('download', async () => {
            await glide(panel.getByRole('button', { name: 'Download', exact: true }));
        });

        await beat('outro');
    },
    async cleanup() {},
});
