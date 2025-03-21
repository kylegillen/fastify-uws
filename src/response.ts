// eslint-disable-next-line ts/ban-ts-comment
// @ts-nocheck
import type { HTTPSocket } from './http-socket'
import { Buffer } from 'node:buffer'
import { STATUS_CODES } from 'node:http'

import { Writable } from 'streamx'
import { ERR_HEAD_SET, ERR_STREAM_DESTROYED } from './errors'
import { kHead, kHeaders } from './symbols'

class Header {
  isMultiValue: boolean
  name: string
  value: unknown

  constructor(name: string, value: unknown) {
    this.isMultiValue = Array.isArray(value)
    this.name = name
    this.value = this.isMultiValue ? value : String(value)
  }
}

const EMPTY = Buffer.alloc(0)
class HTTPResponse {
  chunk: Buffer
  end: boolean
  byteLength: number

  constructor(chunk?: Buffer | null, end = false) {
    this.chunk = chunk || EMPTY
    this.empty = !chunk
    this.end = end
    this.byteLength = this.empty ? 1 : Buffer.byteLength(this.chunk)
  }
}

function onAbort() {
  this.emit('aborted')
}

const noop = () => { }

const options = {
  byteLength(data) {
    return data.byteLength
  },
}

export class Response extends Writable {
  socket: HTTPSocket
  statusCode: number
  statusMessage?: string
  headersSent: boolean
  chunked: boolean
  contentLength: number | null
  writableEnded: boolean
  firstChunk: boolean;
  [kHeaders]: Map<string, Header>

  constructor(socket: HTTPSocket) {
    super(options)

    this.socket = socket
    this.statusCode = 200
    this.headersSent = false
    this.chunked = false
    this.contentLength = null
    this.writableEnded = false
    this.firstChunk = true

    this[kHeaders] = new Map()

    const destroy = this.destroy.bind(this)
    this.once('error', noop)
    socket.once('error', destroy)
    socket.once('close', destroy)
    socket.once('aborted', onAbort.bind(this))
  }

  get aborted() {
    return this.socket.aborted
  }

  get finished() {
    return this.socket.writableEnded && !this.socket.aborted
  }

  get status() {
    return `${this.statusCode} ${this.statusMessage || STATUS_CODES[this.statusCode]}`
  }

  get bytesWritten() {
    return this.socket.bytesWritten
  }

  hasHeader(name: string) {
    return this[kHeaders].has(name.toLowerCase())
  }

  getHeader(name: string) {
    return this[kHeaders].get(name.toLowerCase())?.value
  }

  getHeaders() {
    const headers = {} as Record<string, string>
    this[kHeaders].forEach((header, key) => {
      headers[key] = header.value
    })
    return headers
  }

  setHeader(name: string, value) {
    if (this.headersSent) {
      throw new ERR_HEAD_SET()
    }

    const key = name.toLowerCase()

    if (key === 'content-length') {
      this.contentLength = Number(value)
      return
    }

    if (key === 'transfer-encoding') {
      this.chunked = value.includes('chunked')
      return
    }

    this[kHeaders].set(key, new Header(name, value))
  }

  removeHeader(name: string) {
    if (this.headersSent) {
      throw new ERR_HEAD_SET()
    }

    this[kHeaders].delete(name.toLowerCase())
  }

  writeHead(statusCode, statusMessage, headers) {
    if (this.headersSent) {
      throw new ERR_HEAD_SET()
    }

    this.statusCode = statusCode

    if (typeof statusMessage === 'object') {
      headers = statusMessage
    }
    else if (statusMessage) {
      this.statusMessage = statusMessage
    }

    if (headers) {
      for (const key of Object.keys(headers)) {
        this.setHeader(key, headers[key])
      }
    }
  }

  end(data) {
    if (this.aborted) {
      return
    }
    if (this.destroyed) {
      throw new ERR_STREAM_DESTROYED()
    }
    this.writableEnded = true
    return super.end(new HTTPResponse(data, true))
  }

  destroy(err) {
    if (this.destroyed || this.destroying || this.aborted) {
      return
    }
    this.socket.destroy(err)
  }

  write(data) {
    if (this.aborted) {
      return
    }

    if (this.destroyed) {
      throw new ERR_STREAM_DESTROYED()
    }

    data = new HTTPResponse(data)

    // fast end
    if (this.firstChunk && this.contentLength !== null && this.contentLength === data.byteLength) {
      data.end = true
      this.writableEnded = true
      super.end(data)
      return true
    }

    this.firstChunk = false
    return super.write(data)
  }

  _write(data, cb) {
    if (this.aborted) {
      return cb()
    }

    if (!this.headersSent) {
      this.headersSent = true
      this.socket[kHead] = {
        headers: this[kHeaders],
        status: this.status,
      }
    }

    if (data.end) {
      this.socket.end(data, null, cb)
      return
    }

    this.socket.write(data, null, cb)
  }

  _destroy(cb) {
    if (this.socket.destroyed) {
      return cb()
    }
    this.socket.once('close', cb)
  }
}
