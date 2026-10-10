import { defineScene } from '../../src/harness/scene';

const RELEASE = 'platform-agent';
const NAMESPACE = 'platform';

/**
 * Needs `helm` on PATH: the demo release exists only then. The rollback is shown up to its
 * confirmation and cancelled: confirming would write a third revision the kept cluster cannot undo.
 */
export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/helm/releases/${NAMESPACE}/${RELEASE}/revisions`);
        const revisions = window.getByTestId('release-revisions');
        await revisions.locator('[data-revision="2"]').waitFor({ timeout: 60_000 });
        await focus(revisions);
    },
    async run({ window, beat, anchor, click }) {
        const revisions = window.getByTestId('release-revisions');
        anchor('release-revisions', revisions);
        anchor('rollback-dialog', window.getByRole('alertdialog'));
        await beat('intro');
        await beat('revisions');
        await beat('rollback');
        await click(revisions.locator('[data-revision="1"]').getByRole('button', { name: 'Roll back' }));
        await window.getByRole('alertdialog').waitFor({ timeout: 30_000 });
        await beat('confirm');
        await beat('outro');
    },
    async cleanup({ window }) {
        await window.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    },
});
