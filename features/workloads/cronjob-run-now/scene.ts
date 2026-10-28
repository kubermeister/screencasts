import { defineScene } from '../../../src/harness/scene';

const NAMESPACE = 'production';
const CRONJOB = 'usage-rollup';

/** The jobs Run now made: named after the cron job but, unlike the scheduled ones, owned by nothing. */
function manualJobs(kubectl: (args: string[]) => string): string[] {
    const lines = kubectl([
        '-n',
        NAMESPACE,
        'get',
        'jobs',
        '-o',
        'jsonpath={range .items[*]}{.metadata.name}{"\\t"}{.metadata.ownerReferences[0].kind}{"\\n"}{end}',
    ]);
    return lines
        .split('\n')
        .map((line) => line.split('\t'))
        .filter(([name, owner]) => name?.startsWith(`${CRONJOB}-`) && !owner)
        .map(([name]) => name!);
}

function restore(kubectl: (args: string[]) => string): void {
    kubectl(['-n', NAMESPACE, 'patch', `cronjob/${CRONJOB}`, '--type=merge', '-p', '{"spec":{"suspend":false}}']);
    for (const job of manualJobs(kubectl)) kubectl(['-n', NAMESPACE, 'delete', 'job', job, '--ignore-not-found']);
}

export default defineScene({
    async setup({ goto, window, kubectl, focus }) {
        restore(kubectl);
        await goto(`/workloads/cronjobs/${NAMESPACE}/${CRONJOB}`);
        const page = window.getByTestId('cronjob-page');
        await page.getByRole('button', { name: 'Suspend' }).waitFor({ timeout: 60_000 });
        await focus(page);
    },
    async run({ window, beat, anchor, click, goto, focus }) {
        const page = window.getByTestId('cronjob-page');
        const job = window.getByTestId('jobs-table').locator(`[data-job^="${CRONJOB}-"]`).first();
        anchor('job', job);
        await beat('intro');
        await beat('run-now', async () => {
            await click(page.getByRole('button', { name: 'Run now' }));
            await window
                .getByText(/created/)
                .first()
                .waitFor({ timeout: 30_000 });
        });
        // The callout follows the job's row, so the jobs list is opened under this beat.
        await beat('job', async () => {
            await goto('/workloads/jobs');
            await job.waitFor({ timeout: 60_000 });
            await focus(window.getByTestId('jobs-table'));
        });
        await beat('suspend', async () => {
            await goto(`/workloads/cronjobs/${NAMESPACE}/${CRONJOB}`);
            await page.getByRole('button', { name: 'Suspend' }).waitFor({ timeout: 60_000 });
            await focus(page);
            await click(page.getByRole('button', { name: 'Suspend' }));
            await page.getByRole('button', { name: 'Resume' }).waitFor({ timeout: 30_000 });
        });
        await beat('outro');
    },
    async cleanup({ kubectl }) {
        restore(kubectl);
    },
});
