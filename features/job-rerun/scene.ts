import { defineScene } from '../../src/harness/scene';

const NAMESPACE = 'production';
// Seeded as a quick, completed job; the failed nightly-reconcile is left alone, since the alerts need it.
const JOB = 'db-migrate-0041';

/**
 * Run again deletes the job and resubmits it under the same name, which is the one write a feature
 * video makes on the kept cluster: afterwards the job is as it was, so there is nothing to undo.
 */
export default defineScene({
    async setup({ goto, window, focus }) {
        await goto(`/workloads/jobs/${NAMESPACE}/${JOB}`);
        const page = window.getByTestId('job-page');
        await page.getByRole('button', { name: 'Run again', exact: true }).waitFor({ timeout: 60_000 });
        await focus(page);
    },
    async run({ window, beat, anchor, click, glide }) {
        const page = window.getByTestId('job-page');
        // The header's status badge is the first toned badge on the page; the Overview rows are plain text.
        const status = page.locator('[data-tone]').first();
        const statusReading = (label: string) => page.locator('[data-tone]', { hasText: label }).first();
        const dialog = window.getByRole('alertdialog');
        anchor('status', status);
        anchor('dialog', dialog);
        await beat('intro');
        await beat('completed', async () => {
            await statusReading('Complete').waitFor({ timeout: 60_000 });
            await glide(status);
        });
        await beat('run-again', async () => {
            await click(page.getByRole('button', { name: 'Run again', exact: true }));
            await dialog.waitFor({ timeout: 30_000 });
        });
        await beat('confirm');
        await beat('running', async () => {
            await click(dialog.getByRole('button', { name: 'Run again', exact: true }));
            await window
                .getByText(/started again/)
                .first()
                .waitFor({ timeout: 120_000 });
            // The run lasts a few seconds, so the badge may already read Complete when the next refresh lands.
            await statusReading('Running')
                .waitFor({ timeout: 15_000 })
                .catch(() => undefined);
            await glide(status);
        });
        await beat('complete', async () => {
            await statusReading('Complete').waitFor({ timeout: 120_000 });
        });
        await beat('outro');
    },
    // The dialog closes itself once the write settles, and the job is back under its own name.
    async cleanup({ press }) {
        await press('Escape');
    },
});
