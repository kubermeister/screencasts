import type { Director } from '../../../src/harness/scene';
import { defineScene } from '../../../src/harness/scene';

const HOME = 'production';
const OTHER = 'staging';
// A workload that lives in production only, so its rows leaving proves the list changed scope.
const PRODUCTION_ONLY = 'ingest-worker';

async function selectNamespace({ window, click }: Director, name: string): Promise<void> {
    await click(window.getByTestId('namespace-selector'));
    await click(window.getByRole('option', { name, exact: true }));
    await window.getByTestId('active-namespace').filter({ hasText: name }).waitFor({ timeout: 30_000 });
}

/** The scene only reads the context list: the demo kubeconfig has one context, and nothing is switched. */
export default defineScene({
    async setup(director) {
        const { goto, window, focus } = director;
        await goto('/workloads/pods');
        await window.getByTestId('pods-table').locator('[data-pod^="checkout-"]').first().waitFor({ timeout: 60_000 });
        if (!(await window.getByTestId('active-namespace').filter({ hasText: HOME }).isVisible())) {
            await selectNamespace(director, HOME);
        }
        await focus(window.getByTestId('namespace-selector'));
    },
    async run(director) {
        const { window, beat, anchor, click, press, glide } = director;
        const table = window.getByTestId('pods-table');
        const menu = window.getByRole('menu');
        anchor('selector', window.getByTestId('namespace-selector'));
        anchor('namespace-column', table.getByRole('columnheader', { name: 'Namespace', exact: true }));
        anchor('context', window.getByTestId('context-selector'));

        await beat('intro');

        await beat('selector', async () => {
            await glide(window.getByTestId('namespace-selector'));
        });

        await beat('staging', async () => {
            await selectNamespace(director, OTHER);
            await table
                .locator(`[data-pod^="${PRODUCTION_ONLY}-"]`)
                .first()
                .waitFor({ state: 'hidden', timeout: 30_000 });
        });

        // The Namespace column only appears once rows from more than one namespace are listed.
        await beat('all', async () => {
            await selectNamespace(director, 'All namespaces');
            await table.getByRole('columnheader', { name: 'Namespace', exact: true }).waitFor({ timeout: 60_000 });
        });

        await beat('context', async () => {
            await click(window.getByTestId('context-selector'));
            await menu.waitFor({ timeout: 30_000 });
        });

        await beat('back', async () => {
            await press('Escape');
            await menu.waitFor({ state: 'hidden', timeout: 10_000 });
            await selectNamespace(director, HOME);
        });

        await beat('outro');
    },
    async cleanup(director) {
        const { window, press } = director;
        await press('Escape');
        if (!(await window.getByTestId('active-namespace').filter({ hasText: HOME }).isVisible())) {
            await selectNamespace(director, HOME);
        }
    },
});
