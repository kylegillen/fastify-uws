// eslint-disable-next-line ts/ban-ts-comment
// @ts-nocheck
import type { FastifyServerFactory, RawServerBase, RawServerDefault } from 'fastify'
import { Server } from './server'

export const serverFactory: FastifyServerFactory<any> = (handler, opts) =>
  new Server(handler, opts)

export { default as eventsource } from './plugin-eventsource'
export { default as websocket } from './plugin-websocket'

declare module 'fastify' {
  /* eslint-disable-next-line unused-imports/no-unused-vars */
  interface RouteShorthandOptions<RawServer extends RawServerBase = RawServerDefault> {
    websocket?: boolean
  }

  interface FastifyReply {
    /* eslint-disable-next-line ts/method-signature-style */
    sse(source: MessageEvent): void
  }
}

interface MessageEvent {
  data?: string | object
  id?: string
  event?: string
  retry?: number
}
