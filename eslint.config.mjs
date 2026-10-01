import stylistic from '@stylistic/eslint-plugin'
import tseslint from 'typescript-eslint'

// House rules shared with the KidzLog and FindChildcare repos, enforced here so they hold without
// anyone remembering them.
const houseSyntax = [
  {
    // Two forms per construct: the test can BE the await (`if (await x())`) or CONTAIN one
    // (`if (!(await x()))`), and a descendant selector alone misses the former.
    selector: [
      'IfStatement > AwaitExpression.test',
      'IfStatement > .test AwaitExpression',
      'WhileStatement > AwaitExpression.test',
      'WhileStatement > .test AwaitExpression',
      'DoWhileStatement > AwaitExpression.test',
      'DoWhileStatement > .test AwaitExpression',
      'ConditionalExpression > AwaitExpression.test',
      'ConditionalExpression > .test AwaitExpression',
    ].join(', '),
    message: 'Do not inline await in a condition. Assign it to a named const first, then test that const.',
  },
  {
    selector: 'MemberExpression > AwaitExpression.object, UnaryExpression > AwaitExpression',
    message: 'Do not inline await in an expression. Assign it to a named const first.',
  },
]

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  stylistic.configs.customize({ indent: 2, quotes: 'single', semi: false, braceStyle: 'stroustrup' }),
  {
    rules: {
      'func-style': ['error', 'expression'],
      'no-ternary': 'error',
      'max-params': ['error', 2],
      'curly': ['error', 'all'],
      'no-restricted-syntax': ['error', ...houseSyntax],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
