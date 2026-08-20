import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

import { Dialog } from '@foldkit/ui'

export const SearchResult = S.Struct({
  url: S.String,
  title: S.String,
  excerpt: S.String,
  section: S.String,
  kind: S.String,
})

export const Message = messages({
  UpdatedSearchQuery: {
    query: S.String,
  },
  CompletedFetchSearchResults: {
    results: S.Array(SearchResult),
    query: S.String,
  },
  SelectedSearchResult: {
    url: S.String,
  },
  GotSearchDialogMessage: {
    message: Dialog.Message,
  },
  ClickedOpenSearch: {},
  PressedSearchShortcut: {},
  ClearedSearchQuery: {},
  CompletedNavigateToResult: {},
  CompletedScrollToResult: {},
  CompletedFocusSearchInput: {},
  PressedArrowKey: {
    direction: S.Literals(['Up', 'Down']),
  },
})

export const {
  UpdatedSearchQuery,
  CompletedFetchSearchResults,
  SelectedSearchResult,
  GotSearchDialogMessage,
  ClickedOpenSearch,
  PressedSearchShortcut,
  ClearedSearchQuery,
  CompletedNavigateToResult,
  CompletedScrollToResult,
  CompletedFocusSearchInput,
  PressedArrowKey,
} = Message

export type Message = typeof Message.Type
