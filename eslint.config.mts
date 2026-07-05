// eslint.config.mts
import js from '@eslint/js';
import * as eslint from '@eslint/js';
import stylisticPlugin from '@stylistic/eslint-plugin';
import importPlugin from 'eslint-plugin-import-x';
import nPlugin from 'eslint-plugin-n';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import unicornPlugin from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    extends: [
      eslint.configs.recommended,
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylistic,
      nPlugin.configs['flat/recommended'],
    ],
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    ignores: [
      'dist/**',
      'build/**',
      'node_modules/**',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
      },
    },

    plugins: {
      '@stylistic': stylisticPlugin,
      '@typescript-eslint': tseslint.plugin,
      'import-x': importPlugin,
      'n': nPlugin,
      'unicorn': unicornPlugin,
      'react': reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
    },
    rules: {
      '@stylistic/array-bracket-spacing': [
        'error',
        'never',
      ],
      '@stylistic/arrow-spacing': 'error',
      '@stylistic/eol-last': [
        'error',
        'always',
      ],
      '@stylistic/max-len': [
        'error',
        {
          'code': 150,
          'comments': 150,
          'ignoreComments': true,
          'ignorePattern': 'queryRunner.query|\/\/',
          'ignoreStrings': true,
        },
      ],
      '@stylistic/no-multi-spaces': 'error',
      '@stylistic/no-multiple-empty-lines': [
        'error',
        {
          'max': 1,
          'maxBOF': 0,
          'maxEOF': 1,
        },
      ],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/operator-linebreak': [
        'error',
        'before',
      ],
      '@stylistic/padded-blocks': [
        'error',
        'never',
      ],
      '@stylistic/space-in-parens': [
        'error',
        'never',
      ],
      '@stylistic/spaced-comment': [
        'error',
        'always',
        {
          'block': {
            'balanced': true,
            'exceptions': [
              '*',
            ],
            'markers': [
              '!',
            ],
          },
          'line': {
            'exceptions': [
              '-',
              '+',
            ],
            'markers': [
              '/',
            ],
          },
        },
      ],
      '@stylistic/brace-style': [
        'error',
        '1tbs',
      ],
      '@stylistic/comma-dangle': [
        'error',
        'always-multiline',
      ],
      '@stylistic/comma-spacing': 'error',
      '@stylistic/function-call-spacing': 'error',
      '@stylistic/indent': [
        'error',
        2,
        {
          'ignoredNodes': [
            'FunctionExpression > .params[decorators.length > 0]',
            'FunctionExpression > .params > :matches(Decorator, :not(:first-child))',
            'ClassBody.body > PropertyDefinition[decorators.length > 0] > .key',
          ],
          'SwitchCase': 1,
        },
      ],
      '@stylistic/key-spacing': 'error',
      '@stylistic/keyword-spacing': 'error',
      '@stylistic/lines-between-class-members': [
        'error',
        'always',
        {
          'exceptAfterSingleLine': true,
        },
      ],
      '@stylistic/member-delimiter-style': [
        'error',
        {
          'multiline': {
            'delimiter': 'semi',
          },
          'overrides': {
            'typeLiteral': {
              'multiline': {
                'delimiter': 'comma',
              },
              'singleline': {
                'delimiter': 'comma',
              },
            },
          },
          'singleline': {
            'delimiter': 'semi',
          },
        },
      ],
      '@stylistic/no-extra-semi': 'error',
      '@stylistic/object-curly-newline': [
        'error',
        {
          'consistent': true,
          'multiline': true,
        },
      ],
      '@stylistic/object-curly-spacing': [
        'error',
        'always',
      ],
      '@stylistic/object-property-newline': [
        'error',
        {
          'allowAllPropertiesOnSameLine': true,
        },
      ],
      '@stylistic/padding-line-between-statements': [
        'error',
        {
          'blankLine': 'always',
          'next': 'return',
          'prev': '*',
        },
      ],
      '@stylistic/quotes': [
        'error',
        'single',
        {
          'allowTemplateLiterals': 'always',
          'avoidEscape': true,
        },
      ],
      '@stylistic/semi': [
        'error',
        'always',
      ],
      '@stylistic/space-before-blocks': 'error',
      '@stylistic/space-before-function-paren': [
        'error',
        {
          'anonymous': 'always',
          'asyncArrow': 'always',
          'named': 'never',
        },
      ],
      '@stylistic/space-infix-ops': 'error',
      '@stylistic/template-curly-spacing': ['error', 'never'],
      '@stylistic/type-annotation-spacing': 'error',
      '@typescript-eslint/array-type': [
        'error',
        {
          'default': 'array-simple',
        },
      ],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/ban-tslint-comment': 'error',
      '@typescript-eslint/consistent-indexed-object-style': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          'assertionStyle': 'as',
          'objectLiteralTypeAssertions': 'allow',
        },
      ],
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/default-param-last': 'error',
      '@typescript-eslint/dot-notation': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-member-accessibility': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/init-declarations': 'off',
      '@typescript-eslint/member-ordering': [
        'error',
        {
          'default': [
            'public-static-field',
            'protected-static-field',
            'private-static-field',
            'public-instance-field',
            'protected-instance-field',
            'private-instance-field',
            'constructor',
            'public-instance-method',
            'protected-instance-method',
            'private-instance-method',
          ],
        },
      ],
      '@typescript-eslint/method-signature-style': 'error',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-array-constructor': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-for-in-array': 'error',
      '@typescript-eslint/no-invalid-this': 'error',
      '@typescript-eslint/no-shadow': 'warn',
      '@typescript-eslint/no-this-alias': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          'argsIgnorePattern': '^_',
          'caughtErrors': 'all',
          'destructuredArrayIgnorePattern': '^_',
          'varsIgnorePattern': '^_',
        },
      ],
      '@typescript-eslint/no-useless-constructor': 'error',
      '@typescript-eslint/no-var-requires': [
        'error',
        {
          'allow': [
            '.json$',
          ],
        },
      ],
      '@typescript-eslint/prefer-reduce-type-parameter': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/restrict-plus-operands': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'off',
        {
          'allowRuleToRunWithoutStrictNullChecksIKnowWhatIAmDoing': true,
        },
      ],
      'curly': 'error',
      'eqeqeq': [
        'error',
        'always',
      ],
      'id-denylist': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-extraneous-dependencies': 'error',
      'import-x/order': [
        'error',
        {
          'alphabetize': {
            'caseInsensitive': true,
            'order': 'asc',
          },
          'groups': [
            [
              'builtin',
              'external',
            ],
            'unknown',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          'newlines-between': 'always',
          'pathGroups': [
            {
              'group': 'internal',
              'pattern': '@gpu-monitor/**',
            },
          ],
        },
      ],
      'max-lines': [
        'error',
        1000,
      ],
      'n/no-extraneous-import': 'off',
      'n/no-missing-import': 'off',
      'n/no-missing-require': [
        'error',
        {
          'tryExtensions': ['.js', '.ts'],
        },
      ],
      'no-duplicate-case': 'error',
      'no-fallthrough': [
        'error',
        {
          'commentPattern': 'break[\\s\\w]*omitted',
        },
      ],
      'no-irregular-whitespace': 'error',
      'no-nested-ternary': 'warn',
      'no-new-func': 'error',
      'no-redeclare': 'warn',

      'no-sequences': 'error',
      'no-sparse-arrays': 'error',
      'no-template-curly-in-string': 'error',
      'no-throw-literal': 'error',
      'no-unneeded-ternary': 'error',
      'no-unused-expressions': 'error',
      'object-shorthand': [
        'error',
        'always',
      ],
      'prefer-arrow-callback': 'error',
      'prefer-object-spread': 'error',
      'prefer-promise-reject-errors': 'error',
      'unicorn/explicit-length-check': 'error',
    },
  },
  {
    files: ['packages/renderer/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    ignores: [
      'dist/**',
      'build/**',
      'node_modules/**',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parser: tseslint.parser,
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // Test deps (vitest, @testing-library) are devDependencies
      'n/no-unpublished-import': 'off',
      'n/no-unpublished-require': 'off',
      // Test mocks legitimately have empty functions
      '@typescript-eslint/no-empty-function': 'off',
      // Allow `import()` type annotations in React dynamic imports
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          'prefer': 'type-imports',
          'fixStyle': 'separate-type-imports',
          'disallowTypeAnnotations': false,
        },
      ],
      // Template literals with numbers are idiomatic in this codebase
      '@typescript-eslint/restrict-template-expressions': 'off',
      // Thrown errors don't always need `cause` attached
      '@typescript-eslint/preserve-caught-error': 'off',
      // Promise in void context is intentional (e.g. fire-and-forget)
      '@typescript-eslint/no-misused-promises': 'off',
      // Dynamic runtime checks on Map values
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // Node builtins — engine constraint is in package.json
      'n/no-unsupported-features/node-builtins': 'off',
      // React best practices
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-no-duplicate-props': 'error',
      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Accessibility
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/aria-activedescendant-has-tabindex': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/interactive-supports-focus': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/media-has-caption': 'error',
      'jsx-a11y/mouse-events-have-key-events': 'error',
      'jsx-a11y/no-access-key': 'error',
      'jsx-a11y/no-distracting-elements': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/scope': 'error',
      'jsx-a11y/tabindex-no-positive': 'error',
    },
  },
  {
    files: ['packages/main/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    ignores: [
      'dist/**',
      'build/**',
      'node_modules/**',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parser: tseslint.parser,
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Electron is a devDependency — don't flag as unpublished
      'n/no-unpublished-import': 'off',
      'n/no-unpublished-require': 'off',
      // Electron main process commonly uses process.exit for early termination
      'n/no-process-exit': 'off',
      // Electron IPC handlers and app lifecycle commonly use floating promises
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
);
