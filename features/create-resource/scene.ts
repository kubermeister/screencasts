import { defineScene } from '../../src/harness/scene';

/** The overlay reacts to the drag alone; only a real OS drop carries a file, so the drag is left as it is. */
function dragFile(window: { evaluate: (fn: (kind: string) => void, arg: string) => Promise<void> }, kind: string) {
    return window.evaluate((type) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['kind: Deployment\n'], 'deployment.yaml', { type: 'application/yaml' }));
        globalThis.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, kind);
}

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/create');
        await window.getByRole('combobox', { name: 'Insert template' }).waitFor({ timeout: 60_000 });
        await focus(window.getByTestId('create-page'));
    },
    async run({ window, beat, anchor, click }) {
        const page = window.getByTestId('create-page');
        anchor('editor', page.locator('.cm-editor'));
        anchor('toast', window.locator('[data-sonner-toast]').filter({ hasText: 'Dry run' }));
        anchor('drop-target', window.getByTestId('manifest-drop-target'));
        await beat('intro');
        await click(window.getByRole('combobox', { name: 'Insert template' }));
        await click(window.getByRole('option', { name: /^Deployment / }));
        await page.locator('.cm-line', { hasText: 'kind: Deployment' }).waitFor({ timeout: 30_000 });
        await beat('template');
        await click(page.getByRole('button', { name: 'Dry run' }));
        await window.locator('[data-sonner-toast]').filter({ hasText: 'Dry run' }).waitFor({ timeout: 30_000 });
        await beat('dry-run');
        await dragFile(window, 'dragenter');
        await window.getByTestId('manifest-drop-target').waitFor({ timeout: 10_000 });
        await beat('drop');
        await beat('outro');
    },
    async cleanup({ window }) {
        await dragFile(window, 'dragleave');
    },
});
