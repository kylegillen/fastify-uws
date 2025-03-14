// eslint-disable-next-line ts/ban-ts-comment
// @ts-nocheck

import type uws from 'uWebSockets.js'
import type { HTTPSocket } from './http-socket'

import { Readable } from 'streamx'
import { kHeaders, kReq, kUrl } from './symbols'

const noop = () => { }

function onAbort() {
  this.emit('aborted')
}
export class Request extends Readable {
  socket: HTTPSocket
  method: string
  httpVersion: string
  readableEnded: boolean;
  [kReq]: uws.HttpRequest;
  [kUrl]: string | null;
  [kHeaders]: Record<string, string> | null

  constructor(req: uws.HttpRequest, socket: HTTPSocket, method: string) {
    super()

    this.socket = socket
    this.method = method
    this.httpVersion = '1.1'
    this.readableEnded = false
    this[kReq] = req
    this[kUrl] = null
    this[kHeaders] = null

    this.once('error', noop)
    const destroy = super.destroy.bind(this)
    socket.once('error', destroy)
    socket.once('close', destroy)
    socket.once('aborted', onAbort.bind(this))
  }

  get aborted() {
    return this.socket.aborted
  }

  get url() {
    let url = this[kUrl]
    if (url) {
      return url
    }
    const query = this[kReq].getQuery()
    url = this[kUrl] = this[kReq].getUrl() + (query && query.length > 0 ? `?${query}` : '')
    return url
  }

  set url(url) {
    this[kUrl] = url
  }

  get headers() {
    let headers = this[kHeaders]
    if (headers) {
      return headers
    }
    headers = this[kHeaders] = {}
    this[kReq].forEach((k, v) => {
      headers[k] = v
    })
    return headers
  }

  setEncoding(encoding) {
    this.socket.setEncoding(encoding)
  }

  setTimeout(timeout) {
    this.socket.setTimeout(timeout)
  }

  destroy(err) {
    if (this.destroyed || this.destroying) {
      return
    }
    this.socket.destroy(err)
  }

  unpipe(writable) {
    writable.destroy()
  }

  _read(cb) {
    if (this.destroyed || this.destroying || this.socket.destroyed) {
      return cb()
    }

    this.socket.onRead((err, data) => {
      if (err) {
        return cb(err)
      }

      if (this.destroyed || this.destroying) {
        return cb()
      }

      this.push(data)

      if (!data) {
        this.readableEnded = true
        cb()
      }
    })
  }
}
