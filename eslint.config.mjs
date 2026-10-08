import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: { globals: globals.node },
    },
    {
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
            '@typescript-eslint/no-explicit-any': 'error',
        },
    },
    {
        // A scene is a chain of awaited steps; one unawaited click races the recorder and films the
        // wrong thing without failing. These two rules catch that before a recording does.
        files: ['bin/**/*.ts', 'src/**/*.{ts,tsx}', 'features/**/*.ts', 'overview/**/*.ts', 'hero/**/*.ts'],
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
        },
        rules: {
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
        },
    },
    prettier,
    { ignores: ['node_modules/**', 'out/**', '.cache/**'] },
);
