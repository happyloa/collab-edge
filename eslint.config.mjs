import { fixupPluginRules } from '@eslint/compat';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import unused from 'eslint-plugin-unused-imports';
export default ts.config(
  {
    ignores: [
      'dist/**',
      '.next/**',
      '.tools/**',
      '.wrangler/**',
      'node_modules/**',
      'worker-configuration.d.ts',
      'drizzle/meta/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        console: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
      },
    },
    plugins: {
      react: fixupPluginRules(react),
      'react-hooks': hooks,
      'jsx-a11y': fixupPluginRules(a11y),
      'unused-imports': unused,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...a11y.flatConfigs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off',
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', '.pnpmfile.cjs'],
    languageOptions: {
      globals: {
        module: 'readonly',
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
      },
    },
  },
);
