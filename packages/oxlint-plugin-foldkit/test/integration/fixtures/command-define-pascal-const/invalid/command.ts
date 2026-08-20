import { Effect } from 'effect'
import { Command } from 'foldkit'
import { messages } from 'foldkit/message'

const Message = messages({
  CompletedFetchWeather: {},
})

const fetchWeatherEffect = Effect.succeed(Message.CompletedFetchWeather())

export const fetchWeather = Command.define('FetchWeather', {
  messages: [Message.CompletedFetchWeather],
  execute: fetchWeatherEffect,
})
