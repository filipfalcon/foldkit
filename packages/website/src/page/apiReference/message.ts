import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

import { ApiData } from './model'

export const Message = messages({
  RequestedApiData: {},
  SucceededLoadApiData: {
    apiData: ApiData,
  },
  FailedLoadApiData: {
    error: S.String,
  },
  ToggledSignature: {
    id: S.String,
    isOpen: S.Boolean,
  },
})

export const {
  RequestedApiData,
  SucceededLoadApiData,
  FailedLoadApiData,
  ToggledSignature,
} = Message

export type Message = typeof Message.Type
