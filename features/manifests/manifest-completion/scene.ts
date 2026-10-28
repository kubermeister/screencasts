import { defineScene } from '../../../src/harness/scene';

const NAMESPACE = 'production';
const DEPLOYMENT = 'checkout';

/** A completion opened this recently ignores Enter, which would then insert a line break instead. */
const COMPLETION_SETTLE_MS = 400;

/**
 * Nothing here is saved: the edit adds one field and retypes a value the manifest already had, and
 * cleanup backs out through Cancel and Discard, so the cluster is never written.
 */
export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/workloads/deployments/${NAMESPACE}/${DEPLOYMENT}`);
        await window.getByTestId('deployment-page').waitFor({ timeout: 30_000 });
        await window.getByRole('tab', { name: /Manifest/ }).click();
        await focus(window.getByTestId('manifest-panel'));
    },
    async run({ window, beat, anchor, click, press, type, glide, hold }) {
        const panel = window.getByTestId('manifest-panel');
        const completion = window.locator('.cm-tooltip-autocomplete');
        const fieldDoc = window.locator('.cm-tooltip-hover');
        anchor('completion', completion);
        anchor('field-doc', fieldDoc);

        await beat('intro');

        await beat('edit', async () => {
            await click(panel.getByRole('button', { name: 'Edit', exact: true }));
            // Edit re-reads the object before the editor opens for writing; keys typed before then are lost.
            await panel.locator('.cm-content[contenteditable="true"]').waitFor({ timeout: 30_000 });
        });

        // A new line in the pod template's spec, where most of the schema's fields are still free. The
        // editor only renders the lines near its viewport, so the caret pages down to the template
        // first. The indentation the editor guesses for the new line is selected and retyped, so the
        // line sits at the template spec's own column whatever the guess was.
        await beat('fields', async () => {
            await click(panel.locator('.cm-line', { hasText: /^spec:$/ }).first());
            await press('PageDown');
            await press('PageDown');
            await click(panel.locator('.cm-line', { hasText: /^\s{6}restartPolicy: / }).first());
            await press('End');
            await press('Enter');
            await press('Shift+Home');
            await type('      host');
            await completion.getByText('hostNetwork').waitFor({ timeout: 30_000 });
        });

        await beat('accept', async () => {
            await type('Net');
            await press('Enter');
            await type('f');
            await completion.getByText('false').waitFor({ timeout: 30_000 });
            await hold(COMPLETION_SETTLE_MS);
            await press('Enter');
        });

        // Back up to the strategy's type line: the value is selected back to its key and retyped, which
        // opens the enum's two values as soon as the colon and its space are in.
        await beat('values', async () => {
            await press('PageUp');
            await press('PageUp');
            await click(panel.locator('.cm-line', { hasText: /^\s{4}type: (RollingUpdate|Recreate)$/ }).first());
            await press('End');
            await press('Shift+Home');
            await type('type: R');
            await completion.getByText('Recreate').waitFor({ timeout: 30_000 });
        });

        await beat('pick', async () => {
            await type('o');
            await hold(COMPLETION_SETTLE_MS);
            await press('Enter');
        });

        await beat('describe', async () => {
            const line = panel.locator('.cm-line', { hasText: /^\s{2}progressDeadlineSeconds: / }).first();
            await glide(line.getByText('progressDeadlineSeconds', { exact: true }));
            await fieldDoc.waitFor({ timeout: 30_000 });
        });

        await beat('outro');
    },
    // Backed all the way out, never saved, so closing does not stop on the unsaved-changes guard.
    async cleanup({ window }) {
        await window.getByTestId('manifest-panel').getByRole('button', { name: 'Cancel' }).click();
        await window.getByRole('button', { name: 'Discard' }).click();
    },
});
