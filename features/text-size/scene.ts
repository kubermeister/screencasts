import { defineScene } from '../../src/harness/scene';

export default defineScene({
    async setup({ goto, window, focus }) {
        await goto('/settings/appearance');
        await focus(window.getByRole('combobox', { name: 'Text size', exact: true }));
    },
    async run({ window, beat, anchor, click }) {
        const picker = window.getByRole('combobox', { name: 'Text size', exact: true });
        anchor('text-size-picker', picker);
        await beat('intro');
        await beat('open-picker');
        await click(picker);
        await click(window.getByRole('option', { name: 'Larger', exact: true }));
        await beat('larger');
        await click(picker);
        await click(window.getByRole('option', { name: 'Default', exact: true }));
        await beat('outro');
    },
    async cleanup() {},
});
