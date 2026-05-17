import pino, { type LoggerOptions } from 'pino'
import { env, isDev } from '../config/env.js'
import { getRequestId } from './context/request-context.js'

const baseOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      'accessToken',
      'apiKey',
      'api_key',
      'secret',
      '*.password',
      '*.token',
      '*.secret',
    ],
    remove: true,
  },
  mixin() {
    const requestId = getRequestId()
    return requestId ? { requestId } : {}
  },
}

const transport = isDev
  ? {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', singleLine: false },
    }
  : undefined

export const logger = pino({ ...baseOptions, ...(transport ? { transport } : {}) })
