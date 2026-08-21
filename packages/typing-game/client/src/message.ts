import { Url } from 'foldkit'
import { messages } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'

import { Home, Room } from './page'

export const Message = messages({
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  CompletedNavigateToRoom: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url.Url },
  GotHomeMessage: { message: Home.Message },
  GotRoomMessage: { message: Room.Message },
})
export type Message = typeof Message.Type
