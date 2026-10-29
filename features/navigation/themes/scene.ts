import type { Page } from 'playwright';
import { defineScene } from '../../../src/harness/scene';

/** The theme cards are buttons with the radio role, named by their label and description, so the name is matched by its start. */
function themeCard(window: Page, label: 'Light' | 'Dark') {
    return window.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: new RegExp(`^${label}\\b`) });
}

/** The theme provider resolves the choice into a class on the document element. */
function themed(window: Page, theme: 'light' | 'dark') {
    return window.locator(`html.${theme}`);
}

/**
 * The theme lives in the renderer's localStorage, never in the cluster. The harness starts the
 * window dark; the scene ends on Dark again, and cleanup puts it back should the run stop short.
 */
export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/settings/appearance');
        await window.getByTestId('settings-section-appearance').waitFor({ timeout: 60_000 });
        await focus(window.getByRole('radiogroup', { name: 'Theme' }));
    },
    async run({ window, beat, anchor, click, goto, glide, focus }) {
        const themes = window.getByRole('radiogroup', { name: 'Theme' });
        const summary = window.getByTestId('cluster-summary');
        anchor('theme', themes);
        await beat('intro');
        await beat('appearance', () => glide(themes));
        await beat('light', async () => {
            await click(themeCard(window, 'Light'));
            await themed(window, 'light').waitFor({ timeout: 10_000 });
        });
        await beat('summary', async () => {
            await goto('/overview/summary');
            await summary.getByTestId('alerts').waitFor({ timeout: 60_000 });
            await focus(summary);
            await glide(summary.getByTestId('alerts'));
        });
        await beat('dark', async () => {
            await goto('/settings/appearance');
            await focus(themes);
            await click(themeCard(window, 'Dark'));
            await themed(window, 'dark').waitFor({ timeout: 10_000 });
        });
        await beat('outro');
    },
    async cleanup({ goto, window, click }) {
        if ((await themed(window, 'dark').count()) > 0) return;
        await goto('/settings/appearance');
        await click(themeCard(window, 'Dark'));
        await themed(window, 'dark').waitFor({ timeout: 10_000 });
    },
});
