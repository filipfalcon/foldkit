import { Array, Schema as S, Types } from 'effect'

/** A `TaggedStruct` schema that can be called directly as a constructor: `Foo({ count: 1 })` instead of `Foo.make({ count: 1 })`. */
export type CallableTaggedStruct<
  Tag extends string,
  Fields extends S.Struct.Fields,
> = S.TaggedStruct<Tag, Fields> &
  (keyof Fields extends never
    ? (
        value?: Parameters<S.TaggedStruct<Tag, Fields>['make']>[0] | void,
      ) => Types.Simplify<S.Struct.Type<{ readonly _tag: S.tag<Tag> } & Fields>>
    : (
        value: Parameters<S.TaggedStruct<Tag, Fields>['make']>[0],
      ) => Types.Simplify<
        S.Struct.Type<{ readonly _tag: S.tag<Tag> } & Fields>
      >)

const makeCallable = <Tag extends string, Fields extends S.Struct.Fields>(
  schema: S.TaggedStruct<Tag, Fields>,
): CallableTaggedStruct<Tag, Fields> =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  new Proxy(function () {} as unknown as object, {
    apply(_target, _thisArg, argumentsList) {
      return schema.make(argumentsList[0] ?? {})
    },
    get(_target, property, receiver) {
      return Reflect.get(schema, property, receiver)
    },
    has(_target, property) {
      return Reflect.has(schema, property)
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(schema)
    },
  }) as unknown as CallableTaggedStruct<Tag, Fields>

type TaggedUnionProperty = keyof S.TaggedUnion<{}>

const taggedUnionTypeOnlyPropertyNames = new Set<string>([
  'Rebuild',
  '~type.parameters',
  'Type',
  'Encoded',
  'DecodingServices',
  'EncodingServices',
  '~type.make.in',
  '~type.make',
  '~type.constructor.default',
  'Iso',
  '~type.mutability',
  '~type.optionality',
  '~encoded.mutability',
  '~encoded.optionality',
] satisfies ReadonlyArray<TaggedUnionProperty>)

type MessageVariantNameCollision<Name extends PropertyKey> = Readonly<{
  'Message variant names must not conflict with Schema.TaggedUnion properties': Name
}>

type ValidateMessageVariantNames<
  CasesByTag extends Record<string, S.Struct.Fields>,
> =
  Extract<keyof CasesByTag, TaggedUnionProperty> extends infer Name
    ? [Name] extends [never]
      ? unknown
      : MessageVariantNameCollision<Name & PropertyKey>
    : never

/** The union `messages` returns. A `Schema.TaggedUnion` that also carries one
 *  callable constructor per variant, reachable by tag. */
export type Messages<CasesByTag extends Record<string, S.Struct.Fields>> =
  S.TaggedUnion<{
    readonly [Tag in keyof CasesByTag & string]: S.TaggedStruct<
      Tag,
      CasesByTag[Tag]
    >
  }> & {
    readonly [Tag in keyof CasesByTag & string]: CallableTaggedStruct<
      Tag,
      CasesByTag[Tag]
    >
  }

/**
 * Declares a whole Message union from one record of fields per variant, naming
 * each variant once instead of once per constructor and once in the union list.
 *
 * The result is a `Schema.TaggedUnion`, so it decodes, nests in a Model, and
 * carries `cases`, `guards`, and `isAnyOf`. Each variant hangs off it as a
 * callable constructor that is itself a schema, which is what `Command.define`
 * needs for its `messages` list.
 *
 * Use `Message.match` for exhaustive dispatch. The values are ordinary tagged
 * objects, so Effect `Match` remains available for partial matching, one
 * handler over several tags, and fallbacks.
 *
 * A Submodel's OutMessage is declared the same way, with variants of its own. A
 * Message is a fact the Submodel handles; an OutMessage is a fact it reports to
 * its parent. Sharing one variant between the two unions puts the child's
 * internal vocabulary in the parent's contract, so declare them separately even
 * when a pair happens to carry the same fields.
 *
 * A variant may not be named after the schema surface it would shadow, such as
 * `make`, `match`, `cases`, or `ast`. TypeScript reports the conflicting names,
 * and untyped calls fail with a runtime error.
 *
 * @example
 * ```typescript
 * export const Message = messages({
 *   ClickedReset: {},
 *   ChangedCount: { count: S.Number },
 * })
 * export type Message = typeof Message.Type
 *
 * Message.ClickedReset() // { _tag: 'ClickedReset' }
 * Message.ChangedCount({ count: 1 }) // { _tag: 'ChangedCount', count: 1 }
 * ```
 */
export function messages<
  const CasesByTag extends Record<string, S.Struct.Fields>,
>(
  casesByTag: CasesByTag & ValidateMessageVariantNames<CasesByTag>,
): Messages<CasesByTag> {
  const union = S.TaggedUnion(casesByTag)

  const conflictingNames = Array.filter(
    Object.keys(casesByTag),
    name =>
      Reflect.has(union, name) || taggedUnionTypeOnlyPropertyNames.has(name),
  )
  if (Array.isArrayNonEmpty(conflictingNames)) {
    throw new Error(
      `Message variant names conflict with Schema.TaggedUnion properties: ${conflictingNames.join(', ')}`,
    )
  }

  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  const members = union.cases as Record<
    string,
    S.TaggedStruct<string, S.Struct.Fields>
  >

  const callables: Record<string, unknown> = {}
  for (const [tag, member] of Object.entries(members)) {
    callables[tag] = makeCallable(member)
  }

  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  return Object.assign(union, callables) as unknown as Messages<CasesByTag>
}

/**
 * Wraps `Schema.TaggedStruct` to create a route variant you can call directly as a constructor.
 * Use `r` for route types — enabling `Home()` instead of `Home.make()`.
 *
 * @example
 * ```typescript
 * const Home = r('Home')
 * Home() // { _tag: 'Home' }
 *
 * const UserProfile = r('UserProfile', { id: S.String })
 * UserProfile({ id: 'abc' }) // { _tag: 'UserProfile', id: 'abc' }
 * ```
 */
export function r<Tag extends string>(tag: Tag): CallableTaggedStruct<Tag, {}>
export function r<Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  fields: Fields,
): CallableTaggedStruct<Tag, Fields>
export function r(tag: string, fields: S.Struct.Fields = {}): any {
  return makeCallable(S.TaggedStruct(tag, fields))
}

/**
 * Wraps `Schema.TaggedStruct` to create a callable tagged struct you can call directly as a constructor.
 * Use `ts` for non-message, non-route tagged structs — enabling `Loading()`
 * instead of `Loading.make()`.
 *
 * @example
 * ```typescript
 * const Loading = ts('Loading')
 * Loading() // { _tag: 'Loading' }
 *
 * const Ok = ts('Ok', { data: S.String })
 * Ok({ data: 'hello' }) // { _tag: 'Ok', data: 'hello' }
 * ```
 */
export function ts<Tag extends string>(tag: Tag): CallableTaggedStruct<Tag, {}>
export function ts<Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  fields: Fields,
): CallableTaggedStruct<Tag, Fields>
export function ts(tag: string, fields: S.Struct.Fields = {}): any {
  return makeCallable(S.TaggedStruct(tag, fields))
}
