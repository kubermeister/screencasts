import { defineScene, type Director } from '../../src/harness/scene';

// The seed: the Replica Sets of checkout, the payments-api budget, production-critical, sandboxed and
// require-team-label, all in or above production. Leases live in kube-system, the control plane's.
const NAMESPACE = 'production';
const LEASES_NAMESPACE = 'kube-system';

/** Switch the active namespace through the top bar, the way a reader does. */
async function selectNamespace({ window, click }: Pick<Director, 'window' | 'click'>, namespace: string) {
    await click(window.getByTestId('namespace-selector'));
    await click(window.getByRole('option', { name: namespace, exact: true }));
    await window.getByTestId('active-namespace').filter({ hasText: namespace }).waitFor({ timeout: 30_000 });
}

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/workloads/replicasets');
        const table = window.getByTestId('replicasets-table');
        await table.getByRole('row').filter({ hasText: 'Deployment/checkout' }).first().waitFor({ timeout: 60_000 });
        await focus(table);
    },
    async run(director) {
        const { window, beat, anchor, click, focus } = director;
        const sidebar = window.getByRole('navigation', { name: 'Main' });
        const open = (label: string) => click(sidebar.getByRole('link', { name: label, exact: true }));
        const replicaset = window
            .getByTestId('replicasets-table')
            .getByRole('row')
            .filter({ hasText: 'Deployment/checkout' })
            .first();
        const budget = window.getByTestId('disruptionbudgets-table').locator('[data-disruptionbudget="payments-api"]');
        const priorityClass = window
            .getByTestId('priorityclasses-table')
            .locator('[data-priorityclass="production-critical"]');
        const runtimeClasses = window.getByTestId('runtimeclasses-table');
        const policy = window
            .getByTestId('admissionpolicies-table')
            .locator('[data-admissionpolicy="require-team-label"]');
        const leases = window.getByTestId('leases-table');
        anchor('replicaset', replicaset);
        anchor('budget', budget);
        anchor('priorityclass', priorityClass);
        anchor('policy', policy);
        await beat('intro');
        await beat('replicasets');
        await beat('budgets', async () => {
            await open('Disruption Budgets');
            await budget.getByText('Blocked', { exact: true }).waitFor({ timeout: 60_000 });
            await focus(budget);
        });
        await beat('priorityclasses', async () => {
            await open('Priority Classes');
            await priorityClass.waitFor({ timeout: 60_000 });
            await focus(priorityClass);
        });
        await beat('runtimeclasses', async () => {
            await open('Runtime Classes');
            await runtimeClasses.locator('[data-runtimeclass="sandboxed"]').waitFor({ timeout: 60_000 });
            await focus(runtimeClasses);
        });
        await beat('admissionpolicies', async () => {
            await open('Admission Policies');
            await policy.waitFor({ timeout: 60_000 });
            await focus(policy);
        });
        await beat('leases', async () => {
            await open('Leases');
            await selectNamespace(director, LEASES_NAMESPACE);
            await leases.locator('[data-lease]').first().waitFor({ timeout: 60_000 });
            await focus(leases);
        });
        await beat('outro');
    },
    // The namespace selection outlives the scene, so the kept app is put back on production.
    async cleanup(director) {
        await selectNamespace(director, NAMESPACE);
    },
});
