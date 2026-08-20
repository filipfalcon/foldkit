import { Effect } from 'effect'
import { Diagnostic, type ESTree, Rule, RuleContext } from 'effect-oxlint'

import { isCallExpression } from '../guards.ts'
import {
  hasMessagePayloadProperty,
  messageCases,
  recordFoldkitMessagesBindings,
} from '../message.ts'

/**
 * Requires Messages that carry a { message } payload to follow the Got*Message
 * naming convention.
 */
export const gotSubmodelMessageName = Rule.define({
  name: 'got-submodel-message-name',
  meta: Rule.meta({
    type: 'suggestion',
    description:
      'Name Foldkit Submodel wrapper Messages with the Got*Message convention.',
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const messagesBindings = new Set<string>()
    return {
      Program: (node: ESTree.Node) => {
        recordFoldkitMessagesBindings(messagesBindings, node)
        return Effect.void
      },
      CallExpression: (node: ESTree.Node) => {
        if (!isCallExpression(node)) return Effect.void

        return Effect.forEach(
          messageCases(node, messagesBindings),
          messageCase =>
            hasMessagePayloadProperty(messageCase.fields) &&
            !/^Got[A-Z].*Message$/.test(messageCase.name)
              ? ctx.report(
                  Diagnostic.make({
                    node: messageCase.nameNode,
                    message:
                      'Submodel wrapper Messages should be named Got*Message so Foldkit DevTools can filter them.',
                  }),
                )
              : Effect.void,
          { discard: true },
        )
      },
    }
  },
})
