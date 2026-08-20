import { Schema as S } from 'effect'
import { messages } from 'foldkit/message'

import * as Child from './child'

{
  // ❌ Bad: Got is reserved for Submodel wrappers.
  const Message = messages({
    GotWeather: { temperature: S.Number },
  })
}

{
  // ✅ Good: use a name that does not start with Got for Command results.
  const Message = messages({
    ReceivedWeather: { temperature: S.Number },
  })
}

{
  // ❌ Bad: Got-prefixed wrappers must carry child Messages.
  const Message = messages({
    GotChildMessage: { id: S.String },
  })
}

{
  // ✅ Good: Got wraps a child Message.
  const Message = messages({
    GotChildMessage: {
      id: S.String,
      message: Child.Message,
    },
  })
}
