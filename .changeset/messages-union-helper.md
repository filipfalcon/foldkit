---
'foldkit': minor
'@foldkit/oxlint-plugin': minor
'create-foldkit-app': minor
---

Replace `m` with `messages` in `foldkit/message`. `messages` declares a whole Message union from one record of fields per variant instead of naming each variant once as a constructor and again in the union list.

The result is a `Schema.TaggedUnion`, so it decodes, nests in a Model, and carries `cases`, `guards`, `isAnyOf`, and `match`. Each variant hangs off it as a callable constructor that is itself a schema, which is what `Command.define` needs for its `messages` list. Use `Message.match` for exhaustive dispatch. Effect `Match` remains available for partial matching, fallbacks, and one handler shared across several tags.

This removes the `m` export. Declare Message and OutMessage as separate `messages()` unions, even when two variants happen to carry the same fields.

Update `@foldkit/oxlint-plugin` to recognize `messages()` declarations in the Message naming rules. Remove `message-binding-matches-tag`, since variants no longer have separate constructor bindings whose names can drift from their tags.

Update `create-foldkit-app` templates to declare and match Messages with the new API.

```typescript
export const Message = messages({
  ClickedReset: {},
  ChangedCount: { count: S.Number },
})
export type Message = typeof Message.Type

Message.ClickedReset() // { _tag: 'ClickedReset' }
Message.ChangedCount({ count: 1 }) // { _tag: 'ChangedCount', count: 1 }
```
