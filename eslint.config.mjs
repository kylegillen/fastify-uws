import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  stylistic: {
    indent: 2,
    quotes: 'single',
    semi: false,
  },
  lessOpinionated: true,
  rules: {
    'ts/explicit-function-return-type': ['off'],
  },
})
