import { defineScene } from '../../src/harness/scene';

const CHART = 'platform/platform-agent';

/** Needs `helm` on PATH: the demo repository and its chart exist only then. */
export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/helm/charts');
        await window.getByTestId('charts-table').locator(`[data-chart="${CHART}"]`).waitFor({ timeout: 60_000 });
        await focus(window.getByTestId('charts-table'));
    },
    async run({ window, beat, anchor, click, press, type }) {
        const page = window.getByTestId('install-chart-page');
        anchor('install-review-objects', window.getByTestId('install-review-objects'));
        await beat('intro');
        await beat('charts');
        await click(window.getByRole('button', { name: 'Install platform-agent' }));
        // The chart's values are fetched and rendered into the editor before it can be typed in.
        await page.locator('.cm-line', { hasText: 'replicaCount' }).waitFor({ timeout: 60_000 });
        await beat('values');
        // The release would otherwise carry the chart's name, which the demo release in `platform` already has.
        await click(page.getByRole('textbox', { name: 'Release name' }));
        await press('ControlOrMeta+a');
        await type('agent-canary');
        await click(page.locator('.cm-line', { hasText: /^\s+enabled: false$/ }).first());
        await press('End');
        for (let i = 0; i < 'false'.length; i++) await press('Backspace');
        await type('true');
        // Review only renders and dry-runs; the Install button after it is never pressed.
        await click(page.getByRole('button', { name: 'Review' }));
        await window.getByTestId('install-review-objects').waitFor({ timeout: 60_000 });
        await beat('review');
        await beat('outro');
    },
    async cleanup() {},
});
