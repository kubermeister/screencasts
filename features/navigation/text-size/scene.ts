import { defineScene } from '../../../src/harness/scene';

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/settings/appearance');
        await focus(window.getByRole('combobox', { name: 'Text size', exact: true }));
    },
    async run({ window, beat, anchor, click }) {
        const picker = window.getByRole('combobox', { name: 'Text size', exact: true });
        anchor('text-size-picker', picker);
        await beat('intro');
        await beat('open-picker', () => click(picker));
        await beat('larger', () => click(window.getByRole('option', { name: 'Larger', exact: true })));
        await beat('outro');
    },
    // The app starts from a fresh user-data directory every launch, so the larger size is not kept.
    async cleanup() {},
});
