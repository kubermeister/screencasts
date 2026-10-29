import { defineScene } from '../../src/harness/scene';

const NODE = 'orbit-node-01';

/** Unlike the overview and the hero, this stays on the summary and goes into its panels. */
export default defineScene({
    async setup({ goto, window, kubectl, focus }) {
        kubectl(['uncordon', NODE]);
        await goto('/overview/summary');
        const summary = window.getByTestId('cluster-summary');
        await summary.getByTestId('alerts').waitFor({ timeout: 60_000 });
        await focus(summary);
    },
    async run({ window, beat, anchor, kubectl, glide }) {
        const summary = window.getByTestId('cluster-summary');
        const alerts = summary.getByTestId('alerts');
        const cordoned = alerts.getByRole('listitem').filter({ hasText: 'cordoned' });
        anchor('metrics', summary.getByTestId('dashboard-metrics'));
        anchor('events', summary.getByTestId('recent-events'));
        anchor('alerts', alerts);
        anchor('cordoned', cordoned);
        await beat('intro');
        await beat('usage');
        await beat('events', () => glide(summary.getByTestId('recent-events')));
        await beat('alerts', () => glide(alerts));
        await beat('live', async () => {
            kubectl(['cordon', NODE]);
            await cordoned.waitFor({ timeout: 60_000 });
        });
        await beat('outro');
    },
    async cleanup({ kubectl }) {
        kubectl(['uncordon', NODE]);
    },
});
