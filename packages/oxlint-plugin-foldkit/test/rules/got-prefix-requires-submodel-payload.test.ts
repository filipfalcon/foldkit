import * as Testing from 'effect-oxlint/testing'
import { describe, expect, it } from 'vitest'

import { gotPrefixRequiresSubmodelPayload } from '../../src/rules/got-prefix-requires-submodel-payload.ts'

const message = (name: string, fields: unknown = Testing.objectExpr([])) => ({
  key: name,
  value: fields,
})

const messages = (...cases: ReadonlyArray<ReturnType<typeof message>>) =>
  Testing.callExpr('messages', [Testing.objectExpr(cases)])

const runRule = (node: unknown) =>
  Testing.runRuleMulti(gotPrefixRequiresSubmodelPayload, [
    [
      'Program',
      Testing.program([
        Testing.importDeclWithSpecifiers('foldkit/message', [
          Testing.importSpecifier('messages'),
        ]),
      ]),
    ],
    ['CallExpression', node],
  ])

describe('got-prefix-requires-submodel-payload', () => {
  it('allows Got*Message wrappers whose Message schema is indirect', () => {
    const unknownPayload = runRule(
      messages(
        message(
          'GotInspectorTabsMessage',
          Testing.objectExpr([
            { key: 'message', value: Testing.memberExpr('S', 'Unknown') },
          ]),
        ),
      ),
    )
    const suspendedPayload = runRule(
      messages(
        message(
          'GotSliderMessage',
          Testing.objectExpr([
            {
              key: 'message',
              value: Testing.callOfMember('S', 'suspend', [
                Testing.arrowFn(Testing.memberExpr('Slider', 'Message')),
              ]),
            },
          ]),
        ),
      ),
    )

    expect(unknownPayload).toHaveLength(0)
    expect(suspendedPayload).toHaveLength(0)
  })

  it('reserves Got-prefixed Messages for Submodel wrappers', () => {
    const result = runRule(
      messages(
        message('GotWeather', Testing.objectExpr([{ key: 'temperature' }])),
      ),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain(
      'reserved for Submodel wrappers',
    )
  })

  it('requires Got-prefixed Submodel wrappers to carry a Message payload', () => {
    const result = runRule(
      messages(message('GotChildMessage', Testing.objectExpr([{ key: 'id' }]))),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.diagnostic.message).toContain(
      '{ message: Child.Message }',
    )
  })
})
