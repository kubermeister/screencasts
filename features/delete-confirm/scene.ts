import { defineScene } from '../../src/harness/scene';

// The namespace is one of the kinds whose delete asks for the name; the config map is not.
const NAMESPACE = 'production';
const CONFIG_MAP = 'checkout-config';
// Close to the real name, so the disabled button is plainly about the name and not about nothing typed.
const WRONG_NAME = 'productoin';

/**
 * Nothing here is deleted: the confirmation is cancelled on the namespace and dismissed on the
 * config map, and the dialog's own Delete is never pressed.
 */
export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/overview/namespaces/${NAMESPACE}`);
        const page = window.getByTestId('namespace-page');
        await page.waitFor({ timeout: 60_000 });
        // The header's actions render once the namespace has been read, after the page's test id.
        await focus(page.getByRole('button', { name: 'Delete', exact: true }));
    },
    async run({ window, beat, anchor, goto, click, press, type }) {
        const dialog = window.getByRole('alertdialog');
        // The dialog is in a portal, so scoping to the page keeps the header's Delete apart from the dialog's.
        const headerDelete = (testId: string) =>
            window.getByTestId(testId).getByRole('button', { name: 'Delete', exact: true });
        anchor('dialog', dialog);

        await beat('intro');

        await beat('open', async () => {
            await click(headerDelete('namespace-page'));
            await dialog.waitFor({ timeout: 30_000 });
        });

        await beat('ask');

        await beat('wrong', async () => {
            await click(dialog.getByRole('textbox'));
            await type(WRONG_NAME);
            await dialog
                .getByRole('button', { name: 'Delete', exact: true, disabled: true })
                .waitFor({ timeout: 10_000 });
        });

        await beat('right', async () => {
            await press('ControlOrMeta+a');
            await type(NAMESPACE);
            await dialog
                .getByRole('button', { name: 'Delete', exact: true, disabled: false })
                .waitFor({ timeout: 10_000 });
        });

        await beat('cancel', async () => {
            await click(dialog.getByRole('button', { name: 'Cancel', exact: true }));
            await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
        });

        await beat('plain', async () => {
            await goto(`/workloads/configmaps/${NAMESPACE}/${CONFIG_MAP}`);
            await window.getByTestId('configmap-page').waitFor({ timeout: 60_000 });
            await click(headerDelete('configmap-page'));
            await dialog.waitFor({ timeout: 30_000 });
        });

        await beat('dismiss', async () => {
            await press('Escape');
            await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
        });

        await beat('outro');
    },
    // Escape is harmless with nothing open, and closes the dialog if the run stopped on it.
    async cleanup({ press }) {
        await press('Escape');
    },
});
