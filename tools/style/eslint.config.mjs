// Lint for MCO apps. Apps copy this file verbatim from mco-web-style
// tools/style/; change it here, not in an app. The rules are the ones
// CODE-STYLE.md can check mechanically.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/', '**/vendor/', '**/*.min.js'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, MCO: 'readonly', maplibregl: 'readonly' },
    },
  },
  {
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: { ecmaVersion: 2024, globals: globals.node },
  },
  {
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': 'error',
      // `x == null` is the one loose comparison: it means null or undefined.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // Module scope is already private: no leading underscore on names we declare.
      'id-match': ['error', '^[^_]', { onlyDeclarations: true, properties: false }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='then']",
          message: 'Use async/await, not .then chains.',
        },
      ],
    },
  },
];
