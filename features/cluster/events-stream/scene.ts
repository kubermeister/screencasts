import { defineScene } from '../../../src/harness/scene';

// The seeded production namespace has an image pull failure and a crash loop, so Warning rows with
// reason BackOff are always there to narrow down to.
const QUERY = 'BackOff';

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/overview/events');
        const table = window.getByTestId('events-table');
        await table
            .getByRole('row')
            .filter({ has: window.getByText('Warning', { exact: true }) })
            .first()
            .waitFor({ timeout: 60_000 });
        await focus(table);
    },
    async run({ window, beat, anchor, click, type, glide }) {
        const table = window.getByTestId('events-table');
        const warning = table
            .getByRole('row')
            .filter({ has: window.getByText('Warning', { exact: true }) })
            .first();
        const search = window.getByRole('textbox', { name: 'Search Events…', exact: true });
        anchor('events', table);
        anchor('warning', warning);
        anchor('match', table.getByRole('row').filter({ hasText: QUERY }).first());
        await beat('intro');
        await beat('stream');
        await beat('warning', async () => {
            await glide(warning);
        });
        await beat('narrow', async () => {
            await click(search);
            await type(QUERY);
            // The footer counts the matches against the whole stream only once it is narrowed.
            await window.getByText(/of \d+ results/).waitFor({ timeout: 30_000 });
        });
        await beat('narrowed', async () => {
            await glide(table.getByRole('row').filter({ hasText: QUERY }).first());
        });
        await beat('outro');
    },
    async cleanup() {},
});
