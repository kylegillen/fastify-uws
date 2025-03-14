// eslint-disable-next-line ts/ban-ts-comment
// @ts-nocheck

import { Buffer } from 'node:buffer'
import fp from 'fastify-plugin'

import { kRes, kWs } from './symbols'
import { WebSocket, WebSocketServer } from './websocket-server'

function defaultErrorHandler(err: Error, request: any) {
  request.log.error(err)
  request.raw.destroy(err)
}

function fastifyUws(fastify: any, opts: any, next: any) {
  const { server } = fastify
  const { errorHandler = defaultErrorHandler, options } = opts

  if (errorHandler && typeof errorHandler !== 'function') {
    return next(new Error('invalid errorHandler function'))
  }

  const websocketServer = new WebSocketServer(options)
  server[kWs] = websocketServer

  fastify.decorate('websocketServer', websocketServer)

  fastify.addHook('onRoute', (routeOptions: any) => {
    const isWebSocket = !!routeOptions.websocket
    if (!isWebSocket || routeOptions.method === 'HEAD' || routeOptions.method === 'OPTIONS') {
      return
    }

    const wsOptions = typeof routeOptions.ws === 'object' ? routeOptions.ws : {}
    const handler = routeOptions.handler
    const namespace = Buffer.from(routeOptions.url)

    const topics: Record<string, unknown> = {}
    if (wsOptions.topics) {
      for (const topic of wsOptions.topics) {
        topics[topic] = WebSocket.allocTopic(namespace, topic)
      }
    }

    routeOptions.handler = function (request: any, reply: any) {
      const requestRaw = request.raw
      if (requestRaw[kWs]) {
        reply.hijack()
        const uRes = requestRaw.socket[kRes]
        requestRaw.socket[kWs] = true
        if (requestRaw.socket.aborted || requestRaw.socket.destroyed) {
          return
        }
        uRes.upgrade(
          {
            req: requestRaw,
            handler: (ws: any) => {
              const conn = new WebSocket(namespace, ws, topics)

              let result: any
              try {
                // request.log.info('fastify-uws: websocket connection opened');

                // conn.once('close', () => {
                //   request.log.info('fastify-uws: websocket connection closed');
                // });

                requestRaw.once('error', () => {
                  conn.close()
                })

                requestRaw.once('close', () => {
                  conn.end()
                })

                result = handler.call(this, conn, request, reply)
              }
              catch (err) {
                return errorHandler.call(this, err, conn, request, reply)
              }

              if (result && typeof result.catch === 'function') {
                result.catch(err => errorHandler.call(this, err, conn, request, reply))
              }
            },
          },
          requestRaw.headers['sec-websocket-key'],
          requestRaw.headers['sec-websocket-protocol'],
          requestRaw.headers['sec-websocket-extensions'],
          requestRaw[kWs],
        )
      }
      else {
        return handler.call(this, request, reply)
      }
    }
  })

  next()
}

export default fp(fastifyUws, {
  fastify: '5.x',
  name: '@fastify/websocket',
})
