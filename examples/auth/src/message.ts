import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import { LoggedIn, LoggedOut } from './page'

export const Message = messages({
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  CompletedLogError: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  SucceededSaveSession: {},
  FailedSaveSession: { error: S.String },
  SucceededClearSession: {},
  FailedClearSession: { error: S.String },
  GotLoggedOutMessage: {
    message: LoggedOut.Message,
  },
  GotLoggedInMessage: {
    message: LoggedIn.Message,
  },
})

export type Message = typeof Message.Type
