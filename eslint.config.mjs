import tseslint from 'typescript-eslint';
import pluginN from 'eslint-plugin-n';
import pluginPromise from 'eslint-plugin-promise';
import globals from 'globals';

export default tseslint.config(
	{ ignores: ['dist/', 'node_modules/', 'test/'] },
	...tseslint.configs.recommended,
	pluginN.configs['flat/recommended'],
	pluginPromise.configs['flat/recommended'],
	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: { ...globals.node, ...globals.es2021 },
		},
		rules: {
			'indent': ['error', 'tab'],
			'linebreak-style': 'off',
			'quotes': ['error', 'single'],
			'semi': ['error', 'always'],
			'n/no-missing-import': 'off',
			'n/no-unpublished-import': 'off',
		},
	},
);
