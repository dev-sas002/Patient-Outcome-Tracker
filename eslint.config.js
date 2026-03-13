'use strict';

const js = require('@eslint/js');
const globals = require('globals');

/**
 * Lint configuration for the three Node services. The frontend has its own
 * flat config (`frontend/eslint.config.js`) because it is ESM + JSX with React
 * rules that make no sense here.
 */
module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'project_venv/**',
      'frontend/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      // Correctness
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-return-await': 'error',
      'no-throw-literal': 'error',
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],

      // House style: these repos read better with small, named functions and
      // no leftover scaffolding, so the linter enforces both.
      'object-shorthand': ['error', 'properties'],
      'no-console': 'off', // services log to stdout by design; there is no logger dependency
      'max-depth': ['warn', 4],
    },
  },
  {
    files: ['**/tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // A destructure-to-omit deliberately binds a name it never reads.
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^(_|age$)', ignoreRestSiblings: true },
      ],
    },
  },
];
