import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/workloads/deployments/${NAMESPACE}/checkout`);
        await window.getByTestId('deployment-page').waitFor({ timeout: 30_000 });
        await window.getByRole('tab', { name: /Manifest/ }).click();
        await focus(window.getByTestId('manifest-panel'));
    },
    async run({ window, beat, anchor, click, press, type }) {
        const panel = window.getByTestId('manifest-panel');
        anchor('manifest-diff', window.getByTestId('manifest-diff'));
        await beat('intro');
        await beat('edit');
        await click(panel.getByRole('button', { name: 'Edit', exact: true }));
        // Edit re-reads the object before the editor opens for writing; keys typed before then are lost.
        await panel.locator('.cm-content[contenteditable="true"]').waitFor({ timeout: 30_000 });
        // The spec's replicas line; the status block repeats the word further down.
        await click(panel.locator('.cm-line', { hasText: /^\s{2}replicas: \d+$/ }).first());
        await press('End');
        await press('Backspace');
        await type('5');
        await click(panel.getByRole('button', { name: 'Review changes' }));
        await window.getByTestId('manifest-diff').getByText('replicas: 5').first().waitFor({ timeout: 30_000 });
        await beat('review');
        await beat('outro');
    },
    // Backed all the way out, never saved, so closing does not stop on the unsaved-changes guard.
    async cleanup({ window }) {
        await window.getByRole('button', { name: 'Keep editing' }).click();
        await window.getByTestId('manifest-panel').getByRole('button', { name: 'Cancel' }).click();
        await window.getByRole('button', { name: 'Discard' }).click();
    },
});
