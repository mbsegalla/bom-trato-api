import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import typescriptEslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'commitlint.config.cjs', 'eslint.config.mjs', 'src/generated/**'],
  },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    extends: [eslint.configs.recommended, typescriptEslint.configs.recommendedTypeChecked, eslintConfigPrettier],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            // Side-effect imports
            ['^\\u0000'],

            // Node.js built-in modules
            ['^node:'],

            // External dependencies
            ['^@nestjs', '^@?\\w'],

            // Internal @/ alias
            ['^@/'],

            // Absolute src/ imports
            ['^src/'],

            // Parent directory imports
            ['^\\.\\.(?!/?$)', '^\\.\\./?$'],

            // Relative imports
            ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
          ],
        },
      ],
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      // Empty classes are common in NestJS modules
      '@typescript-eslint/no-extraneous-class': 'off',
      // Async implementations do not always need await
      '@typescript-eslint/require-await': 'off',
      'no-empty-function': 'off',
      '@typescript-eslint/no-empty-function': 'warn',
      'no-console': [
        'warn',
        {
          allow: ['warn', 'error'],
        },
      ],
      'no-duplicate-imports': [
        'error',
        {
          allowSeparateTypeImports: true,
        },
      ],
      'prefer-const': 'error',
      'object-shorthand': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
    },
  },
);
