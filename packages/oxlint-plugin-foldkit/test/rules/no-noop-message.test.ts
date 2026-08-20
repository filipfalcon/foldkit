import * as Testing from 'effect-oxlint/testing'
import { describe, expect, it } from 'vitest'

import { noNoopMessage } from '../../src/rules/no-noop-message.ts'

const message = (name: string, fields: unknown = Testing.objectExpr([])) => ({
  key: name,
  value: fields,
})

const messages = (...cases: ReadonlyArray<ReturnType<typeof message>>) =>
  Testing.callExpr('messages', [Testing.objectExpr(cases)])

const foldkitMessagesProgram = (local = 'messages') =>
  Testing.program([
    Testing.importDeclWithSpecifiers('foldkit/message', [
      Testing.importSpecifier('messages', local),
    ]),
  ])

const runRule = (node: unknown, program = foldkitMessagesProgram()) =>
  Testing.runRuleMulti(noNoopMessage, [
    ['Program', program],
    ['CallExpression', node],
  ])

describe('no-noop-message', () => {
  it('flags generic NoOp Messages', () => {
    const result = runRule(messages(message('NoOp')))

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain('avoid generic NoOp')
  })

  it('allows specific Message names', () => {
    const result = runRule(messages(message('ClickedSave')))

    expect(result).toHaveLength(0)
  })

  it('follows an aliased Foldkit messages import', () => {
    const result = runRule(
      Testing.callExpr('declareMessages', [
        Testing.objectExpr([message('NoOp')]),
      ]),
      foldkitMessagesProgram('declareMessages'),
    )

    expect(result).toHaveLength(1)
  })

  it('ignores an unrelated messages helper', () => {
    const result = runRule(messages(message('NoOp')), Testing.program())

    expect(result).toHaveLength(0)
  })

  it('recognizes a computed string variant name', () => {
    const result = runRule(
      Testing.callExpr('messages', [
        {
          type: 'ObjectExpression',
          properties: [
            {
              type: 'Property',
              computed: true,
              key: Testing.strLiteral('NoOp'),
              value: Testing.objectExpr([]),
            },
          ],
        },
      ]),
    )

    expect(result).toHaveLength(1)
  })
})
