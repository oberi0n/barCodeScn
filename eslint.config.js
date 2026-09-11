import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist'] },
  eslint.configs.recommended,
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: { caches: 'readonly', fetch: 'readonly', self: 'readonly' },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      globals: {
        crypto: 'readonly',
        caches: 'readonly',
        console: 'readonly',
        AudioContext: 'readonly',
        document: 'readonly',
        DOMException: 'readonly',
        fetch: 'readonly',
        Headers: 'readonly',
        GeolocationPosition: 'readonly',
        GeolocationPositionError: 'readonly',
        HTMLElement: 'readonly',
        HTMLMediaElement: 'readonly',
        HTMLVideoElement: 'readonly',
        localStorage: 'readonly',
        MediaStream: 'readonly',
        MediaStreamConstraints: 'readonly',
        navigator: 'readonly',
        requestAnimationFrame: 'readonly',
        self: 'readonly',
        window: 'readonly',
      },
      parserOptions: { sourceType: 'module' },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'warn',
    },
  },
];
