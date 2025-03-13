// src/server.ts
import dns from "node:dns/promises";
import { METHODS } from "node:http";
import process from "node:process";
import { EventEmitter as EventEmitter2 } from "eventemitter3";
import ipaddr from "ipaddr.js";
import uws from "uWebSockets.js";

// src/errors.ts
import createError from "@fastify/error";
var ERR_INVALID_METHOD = createError("HPE_INVALID_METHOD", "Invalid method encountered");
var ERR_HEAD_SET = createError(
  "ERR_HEAD_SET",
  "Cannot set headers after they are sent to the client"
);
var ERR_ADDRINUSE = createError(
  "EADDRINUSE",
  "listen EADDRINUSE: address already in use %s:%s"
);
var ERR_UPGRADE = createError("ERR_UPGRADE", "Cannot upgrade to WebSocket protocol %o");
var ERR_STREAM_DESTROYED = createError("ERR_STREAM_DESTROYED", "Stream destroyed");
var ERR_UWS_APP_NOT_FOUND = createError(
  "ERR_UWS_APP_NOT_FOUND",
  "uWebSockets app not found"
);
var ERR_ENOTFOUND = createError("ERR_ENOTFOUND", "getaddrinfo ENOTFOUND %s");
var ERR_SOCKET_BAD_PORT = createError(
  "ERR_SOCKET_BAD_PORT",
  "RangeError [ERR_SOCKET_BAD_PORT]: options.port should be >= 0 and < 65536. Received (%s)"
);
var ERR_SERVER_DESTROYED = createError("ERR_SERVER_DESTROYED", "Server destroyed");

// src/http-socket.ts
import { Buffer } from "node:buffer";
import { EventEmitter } from "eventemitter3";

// src/symbols.ts
var kHttps = Symbol("uws.https");
var kReq = Symbol("uws.req");
var kRes = Symbol("uws.res");
var kServer = Symbol("uws.server");
var kHeaders = Symbol("uws.headers");
var kUrl = Symbol("uws.url");
var kAddress = Symbol("uws.address");
var kRemoteAdress = Symbol("uws.remoteAddress");
var kEncoding = Symbol("uws.encoding");
var kTimeoutRef = Symbol("uws.timeoutRef");
var kEnded = Symbol("uws.ended");
var kReadyState = Symbol("uws.readyState");
var kWriteOnly = Symbol("uws.writeOnly");
var kHandler = Symbol("uws.handler");
var kListenSocket = Symbol("uws.listenSocket");
var kListen = Symbol("uws.listen");
var kApp = Symbol("uws.app");
var kClosed = Symbol("uws.closed");
var kWs = Symbol("uws.ws");
var kTopic = Symbol("uws.topic");
var kDestroyError = Symbol("uws.destroyError");
var kUwsRemoteAddress = Symbol("uws.uwsRemoteAddress");
var kHead = Symbol("uws.head");
var kWebSocketOptions = Symbol("uws.webSocketOptions");
var kListenAll = Symbol("uws.listenAll");
var kListening = Symbol("uws.listening");
var kClientError = Symbol("uws.clientError");

// src/http-socket.ts
var localAddressIpv6 = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
var toHex = (buf, start, end) => buf.subarray(start, end).toString("hex");
var noop = () => {
};
function onAbort() {
  this.aborted = true;
  this.emit("aborted");
  this.errored && this.emit("error", this.errored);
  this.emit("close");
}
function onDrain(offset) {
  this.emit("drain", offset);
  return true;
}
function onTimeout() {
  if (!this.destroyed) {
    this.emit("timeout");
    this.abort();
  }
}
function drain(socket, cb) {
  socket.writableNeedDrain = true;
  let done = false;
  const onClose = () => {
    socket.removeListener("drain", onDrain2);
    if (done) {
      return;
    }
    done = true;
    cb();
  };
  const onDrain2 = () => {
    if (done) {
      return;
    }
    socket.writableNeedDrain = false;
    socket.removeListener("close", onClose);
    socket.removeListener("drain", onDrain2);
    cb();
  };
  socket.on("drain", onDrain2);
  socket.once("close", onClose);
}
function writeHead(res, head) {
  if (head.status) {
    res.writeStatus(head.status);
  }
  if (head.headers) {
    for (const header of head.headers.values()) {
      if (header.isMultiValue) {
        for (const value of header.value) {
          res.writeHeader(header.name, value);
        }
      } else {
        res.writeHeader(header.name, header.value);
      }
    }
  }
}
function byteLength(data) {
  if (data?.empty) {
    return 0;
  }
  if (data?.byteLength !== void 0) {
    return data.byteLength;
  }
  return Buffer.byteLength(data);
}
function getChunk(data) {
  if (data?.chunk) {
    return data.chunk;
  }
  return data;
}
var HTTPSocket = class extends EventEmitter {
  aborted = false;
  writableNeedDrain = false;
  bytesRead = 0;
  bytesWritten = 0;
  writableEnded = false;
  errored = null;
  [kServer];
  [kRes];
  [kWriteOnly];
  [kReadyState] = { read: false, write: false };
  [kEncoding] = null;
  [kRemoteAdress] = null;
  [kUwsRemoteAddress] = null;
  [kHead] = null;
  [kClientError] = false;
  [kTimeoutRef];
  constructor(server, res, writeOnly) {
    super();
    this[kServer] = server;
    this[kRes] = res;
    this[kWriteOnly] = writeOnly;
    this.once("error", noop);
    res.onAborted(onAbort.bind(this));
    res.onWritable(onDrain.bind(this));
    if (server.timeout) {
      this[kTimeoutRef] = setTimeout(onTimeout.bind(this), server.timeout);
    }
  }
  get readyState() {
    const state = this[kReadyState];
    if (state.read && !state.write) {
      return "readOnly";
    }
    if (!state.read && state.write) {
      return "writeOnly";
    }
    if (state.read) {
      return "open";
    }
    return "opening";
  }
  get writable() {
    return true;
  }
  get readable() {
    return true;
  }
  get encrypted() {
    return !!this[kServer][kHttps];
  }
  get remoteAddress() {
    let remoteAddress = this[kRemoteAdress];
    if (remoteAddress) {
      return remoteAddress;
    }
    let buf = this[kUwsRemoteAddress];
    if (!buf) {
      buf = this[kUwsRemoteAddress] = Buffer.from(this[kRes].getRemoteAddress());
    }
    if (buf.length === 4) {
      remoteAddress = `${buf.readUInt8(0)}.${buf.readUInt8(1)}.${buf.readUInt8(2)}.${buf.readUInt8(3)}`;
    } else {
      if (buf.equals(localAddressIpv6)) {
        remoteAddress = "::1";
      } else {
        remoteAddress = `${toHex(buf, 0, 2)}:${toHex(buf, 2, 4)}:${toHex(buf, 4, 6)}:${toHex(buf, 6, 8)}:${toHex(buf, 8, 10)}:${toHex(buf, 10, 12)}:${toHex(buf, 12, 14)}:${toHex(buf, 14, buf.lenght)}`;
      }
    }
    this[kRemoteAdress] = remoteAddress;
    return remoteAddress;
  }
  get remoteFamily() {
    if (!this[kUwsRemoteAddress]) {
      this[kUwsRemoteAddress] = Buffer.from(this[kRes].getRemoteAddress());
    }
    return this[kUwsRemoteAddress].length === 4 ? "IPv4" : "IPv6";
  }
  get destroyed() {
    return this.writableEnded || this.aborted;
  }
  address() {
    return { ...this[kServer][kAddress] };
  }
  abort() {
    if (this.aborted) {
      return;
    }
    this.aborted = true;
    if (!this[kWs] && !this.writableEnded) {
      this[kRes].close();
    }
  }
  setEncoding(encoding) {
    this[kEncoding] = encoding;
  }
  destroy(err) {
    if (this.aborted) {
      return;
    }
    this._clearTimeout();
    this.errored = err;
    this.abort();
  }
  onRead(cb) {
    if (this[kWriteOnly] || this.aborted) {
      return cb(null, null);
    }
    let done = false;
    this[kReadyState].read = true;
    const encoding = this[kEncoding];
    try {
      this[kRes].onData((chunk, isLast) => {
        if (done) {
          return;
        }
        this.bytesRead += chunk.byteLength;
        if (encoding) {
          chunk = Buffer.from(chunk).toString(encoding);
        } else {
          chunk = Buffer.copyBytesFrom(new Uint8Array(chunk));
        }
        this.emit("data", chunk);
        cb(null, chunk);
        if (isLast) {
          done = true;
          cb(null, null);
        }
      });
    } catch (err) {
      done = true;
      this.destroy(err);
      cb(err);
    }
  }
  end(data, _, cb = noop) {
    if (this.aborted) {
      throw new ERR_STREAM_DESTROYED();
    }
    if (!data) {
      return this.abort();
    }
    this.writableEnded = true;
    this._clearTimeout();
    const res = this[kRes];
    res.cork(() => {
      if (this[kHead]) {
        writeHead(res, this[kHead]);
        this[kHead] = null;
      }
      res.end(getChunk(data));
      this.bytesWritten += byteLength(data);
      this.emit("close");
      this.emit("finish");
      cb();
    });
  }
  write(data, _, cb = noop) {
    if (this.destroyed) {
      throw new ERR_STREAM_DESTROYED();
    }
    if (this[kClientError] && data.startsWith("HTTP/")) {
      const [header, body] = data.split("\r\n\r\n");
      const [first, ...headers] = header.split("\r\n");
      const [, code, statusText] = first.split(" ");
      this[kHead] = {
        headers: headers.map((header2) => {
          const [name, ...value] = header2.split(": ");
          return { name, value: value.join(": ").trim() };
        }).filter((header2) => header2.name.toLowerCase() !== "content-length"),
        status: `${code} ${statusText}`
      };
      data = body;
      return this.end(data, _, cb);
    }
    const res = this[kRes];
    this[kReadyState].write = true;
    res.cork(() => {
      if (this[kHead]) {
        writeHead(res, this[kHead]);
        this[kHead] = null;
      }
      const drained = res.write(getChunk(data));
      this.bytesWritten += byteLength(data);
      if (drained) {
        return cb();
      }
      drain(this, cb);
    });
    return !this.writableNeedDrain;
  }
  _clearTimeout() {
    this[kTimeoutRef] && clearTimeout(this[kTimeoutRef]);
  }
};

// src/request.ts
import { Readable } from "streamx";
var noop2 = () => {
};
function onAbort2() {
  this.emit("aborted");
}
var Request = class extends Readable {
  socket;
  method;
  httpVersion;
  readableEnded;
  [kReq];
  [kUrl];
  [kHeaders];
  constructor(req, socket, method) {
    super();
    this.socket = socket;
    this.method = method;
    this.httpVersion = "1.1";
    this.readableEnded = false;
    this[kReq] = req;
    this[kUrl] = null;
    this[kHeaders] = null;
    this.once("error", noop2);
    const destroy = super.destroy.bind(this);
    socket.once("error", destroy);
    socket.once("close", destroy);
    socket.once("aborted", onAbort2.bind(this));
  }
  get aborted() {
    return this.socket.aborted;
  }
  get url() {
    let url = this[kUrl];
    if (url) {
      return url;
    }
    const query = this[kReq].getQuery();
    url = this[kUrl] = this[kReq].getUrl() + (query && query.length > 0 ? `?${query}` : "");
    return url;
  }
  set url(url) {
    this[kUrl] = url;
  }
  get headers() {
    let headers = this[kHeaders];
    if (headers) {
      return headers;
    }
    headers = this[kHeaders] = {};
    this[kReq].forEach((k, v) => {
      headers[k] = v;
    });
    return headers;
  }
  setEncoding(encoding) {
    this.socket.setEncoding(encoding);
  }
  setTimeout(timeout) {
    this.socket.setTimeout(timeout);
  }
  destroy(err) {
    if (this.destroyed || this.destroying) {
      return;
    }
    this.socket.destroy(err);
  }
  unpipe(writable) {
    writable.destroy();
  }
  _read(cb) {
    if (this.destroyed || this.destroying || this.socket.destroyed) {
      return cb();
    }
    this.socket.onRead((err, data) => {
      if (err) {
        return cb(err);
      }
      if (this.destroyed || this.destroying) {
        return cb();
      }
      this.push(data);
      if (!data) {
        this.readableEnded = true;
        cb();
      }
    });
  }
};

// src/response.ts
import { Buffer as Buffer2 } from "node:buffer";
import { STATUS_CODES } from "node:http";
import { Writable } from "streamx";
var Header = class {
  isMultiValue;
  name;
  value;
  constructor(name, value) {
    this.isMultiValue = Array.isArray(value);
    this.name = name;
    this.value = this.isMultiValue ? value : String(value);
  }
};
var EMPTY = Buffer2.alloc(0);
var HTTPResponse = class {
  chunk;
  end;
  byteLength;
  constructor(chunk, end = false) {
    this.chunk = chunk || EMPTY;
    this.empty = !chunk;
    this.end = end;
    this.byteLength = this.empty ? 1 : Buffer2.byteLength(this.chunk);
  }
};
function onAbort3() {
  this.emit("aborted");
}
var noop3 = () => {
};
var options = {
  byteLength(data) {
    return data.byteLength;
  }
};
var Response = class extends Writable {
  socket;
  statusCode;
  statusMessage;
  headersSent;
  chunked;
  contentLength;
  writableEnded;
  firstChunk;
  [kHeaders];
  constructor(socket) {
    super(options);
    this.socket = socket;
    this.statusCode = 200;
    this.headersSent = false;
    this.chunked = false;
    this.contentLength = null;
    this.writableEnded = false;
    this.firstChunk = true;
    this[kHeaders] = /* @__PURE__ */ new Map();
    const destroy = this.destroy.bind(this);
    this.once("error", noop3);
    socket.once("error", destroy);
    socket.once("close", destroy);
    socket.once("aborted", onAbort3.bind(this));
  }
  get aborted() {
    return this.socket.aborted;
  }
  get finished() {
    return this.socket.writableEnded && !this.socket.aborted;
  }
  get status() {
    return `${this.statusCode} ${this.statusMessage || STATUS_CODES[this.statusCode]}`;
  }
  get bytesWritten() {
    return this.socket.bytesWritten;
  }
  hasHeader(name) {
    return this[kHeaders].has(name.toLowerCase());
  }
  getHeader(name) {
    return this[kHeaders].get(name.toLowerCase())?.value;
  }
  getHeaders() {
    const headers = {};
    this[kHeaders].forEach((header, key) => {
      headers[key] = header.value;
    });
    return headers;
  }
  setHeader(name, value) {
    if (this.headersSent) {
      throw new ERR_HEAD_SET();
    }
    const key = name.toLowerCase();
    if (key === "content-length") {
      this.contentLength = Number(value);
      return;
    }
    if (key === "transfer-encoding") {
      this.chunked = value.includes("chunked");
      return;
    }
    this[kHeaders].set(key, new Header(name, value));
  }
  removeHeader(name) {
    if (this.headersSent) {
      throw new ERR_HEAD_SET();
    }
    this[kHeaders].delete(name.toLowerCase());
  }
  writeHead(statusCode, statusMessage, headers) {
    if (this.headersSent) {
      throw new ERR_HEAD_SET();
    }
    this.statusCode = statusCode;
    if (typeof statusMessage === "object") {
      headers = statusMessage;
    } else if (statusMessage) {
      this.statusMessage = statusMessage;
    }
    if (headers) {
      for (const key of Object.keys(headers)) {
        this.setHeader(key, headers[key]);
      }
    }
  }
  end(data) {
    if (this.aborted) {
      return;
    }
    if (this.destroyed) {
      throw new ERR_STREAM_DESTROYED();
    }
    this.writableEnded = true;
    return super.end(new HTTPResponse(data, true));
  }
  destroy(err) {
    if (this.destroyed || this.destroying || this.aborted) {
      return;
    }
    this.socket.destroy(err);
  }
  write(data) {
    if (this.aborted) {
      return;
    }
    if (this.destroyed) {
      throw new ERR_STREAM_DESTROYED();
    }
    data = new HTTPResponse(data);
    if (this.firstChunk && this.contentLength !== null && this.contentLength === data.byteLength) {
      data.end = true;
      this.writableEnded = true;
      super.end(data);
      return true;
    }
    this.firstChunk = false;
    return super.write(data);
  }
  _write(data, cb) {
    if (this.aborted) {
      return cb();
    }
    if (!this.headersSent) {
      this.headersSent = true;
      this.socket[kHead] = {
        headers: this[kHeaders],
        status: this.status
      };
    }
    if (data.end) {
      this.socket.end(data, null, cb);
      return;
    }
    this.socket.write(data, null, cb);
  }
  _destroy(cb) {
    if (this.socket.destroyed) {
      return cb();
    }
    this.socket.once("close", cb);
  }
};

// src/server.ts
function createApp() {
  return uws.App();
}
var VALID_METHODS = new Map(METHODS.map((method) => [method.toLowerCase(), method]));
var mainServer = {};
var Server = class extends EventEmitter2 {
  [kHandler];
  timeout;
  [kHttps];
  [kWs];
  [kAddress];
  [kListenSocket];
  [kApp];
  [kClosed];
  [kListenAll];
  [kListening];
  constructor(handler, opts = {}) {
    super();
    const { connectionTimeout = 0, https = false } = opts;
    this[kHandler] = handler;
    this.timeout = connectionTimeout;
    this[kHttps] = https;
    this[kWs] = null;
    this[kAddress] = null;
    this[kListenSocket] = null;
    this[kApp] = createApp();
    this[kClosed] = false;
  }
  get encrypted() {
    return !!this[kHttps];
  }
  get listening() {
    return this[kListening];
  }
  setTimeout(timeout) {
    this.timeout = timeout;
  }
  address() {
    return this[kAddress];
  }
  listen(listenOptions, cb) {
    if (listenOptions?.signal) {
      listenOptions.signal.addEventListener("abort", () => {
        this.close();
      });
    }
    this[kListen](listenOptions).then(() => {
      cb?.();
      this[kListening] = true;
      this.emit("listening");
    }).catch((err) => {
      this[kAddress] = null;
      process.nextTick(() => this.emit("error", err));
    });
  }
  closeIdleConnections() {
    this.close();
  }
  close(cb = () => {
  }) {
    this[kAddress] = null;
    this[kListening] = false;
    if (this[kClosed]) {
      return cb();
    }
    const port = this[kAddress]?.port;
    if (port !== void 0 && mainServer[port] === this) {
      delete mainServer[port];
    }
    this[kAddress] = null;
    this[kClosed] = true;
    if (this[kListenSocket]) {
      uws.us_listen_socket_close(this[kListenSocket]);
      this[kListenSocket] = null;
    }
    if (this[kWs]) {
      for (const conn of this[kWs].connections) {
        conn.close();
      }
    }
    process.nextTick(() => {
      this.emit("close");
      cb();
    });
  }
  ref() {
  }
  unref() {
  }
  async [kListen]({ port, host }) {
    if (this[kClosed]) {
      throw new ERR_SERVER_DESTROYED();
    }
    if (port !== void 0 && port !== null && Number.isNaN(Number(port))) {
      throw new ERR_SOCKET_BAD_PORT(port);
    }
    port = port === void 0 || port === null ? 0 : Number(port);
    const lookupAddress = await dns.lookup(host);
    this[kAddress] = {
      ...lookupAddress,
      port
    };
    if (this[kAddress].address.startsWith("[")) {
      throw new ERR_ENOTFOUND(this[kAddress].address);
    }
    const parsedAddress = ipaddr.parse(this[kAddress].address);
    this[kAddress].family = parsedAddress.kind() === "ipv6" ? "IPv6" : "IPv4";
    const longAddress = parsedAddress.toNormalizedString();
    const app = this[kApp];
    const onRequest = (res, req) => {
      const method = VALID_METHODS.get(req.getMethod());
      const socket = new HTTPSocket(this, res, method === "GET" || method === "HEAD");
      if (!method) {
        socket[kClientError] = true;
        this.emit("clientError", new ERR_INVALID_METHOD(), socket);
        return;
      }
      const request = new Request(req, socket, method);
      const response = new Response(socket);
      if (request.headers.upgrade) {
        this.emit("upgrade", request, socket);
      }
      this[kHandler](request, response);
    };
    app.any("/*", onRequest);
    if (port !== 0 && mainServer[port]) {
      this[kWs] = mainServer[port][kWs];
    }
    if (this[kWs]) {
      this[kWs].addServer(this);
    }
    return new Promise((resolve, reject) => {
      const onListen = (listenSocket) => {
        if (!listenSocket) {
          return reject(new ERR_ADDRINUSE(this[kAddress].address, port));
        }
        this[kListenSocket] = listenSocket;
        port = this[kAddress].port = uws.us_socket_local_port(listenSocket);
        if (!mainServer[port]) {
          mainServer[port] = this;
        }
        resolve();
      };
      this[kListenAll] = host === "localhost";
      if (this[kListenAll]) {
        app.listen(port, onListen);
      } else {
        app.listen(longAddress, port, onListen);
      }
    });
  }
};

// src/plugin-eventsource.ts
import fp from "fastify-plugin";
import { pushable } from "it-pushable";
import toStream from "it-to-stream";
var plugin_eventsource_default = fp(
  async (instance, _) => {
    instance.decorateReply("sse", function(source) {
      if (!this.raw.headersSent) {
        this.sseContext = { source: pushable({ objectMode: true }) };
        const headers = this.getHeaders();
        for (const [key, value] of Object.entries(headers)) {
          this.raw.setHeader(key, value ?? "");
        }
        this.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        this.raw.setHeader("Connection", "keep-alive");
        this.raw.setHeader(
          "Cache-Control",
          "private, no-cache, no-store, must-revalidate, max-age=0, no-transform"
        );
        this.raw.setHeader("Pragma", "no-cache");
        this.raw.setHeader("Expire", "0");
        this.raw.setHeader("X-Accel-Buffering", "no");
        handleAsyncIterable(this, this.sseContext.source);
      }
      if (isAsyncIterable(source)) {
        return handleAsyncIterable(this, source);
      }
      if (!this.sseContext?.source) {
        this.sseContext = { source: pushable({ objectMode: true }) };
        handleAsyncIterable(this, this.sseContext.source);
      }
      this.sseContext.source.push(source);
    });
  },
  {
    fastify: "5.x",
    name: "@fastify/eventsource"
  }
);
function handleAsyncIterable(reply, source) {
  toStream(transformAsyncIterable(source)).pipe(reply.raw);
}
async function* transformAsyncIterable(source) {
  for await (const message of source) {
    yield transform(message);
  }
}
function isAsyncIterable(source) {
  if (source === null || source === void 0 || typeof source !== "object") {
    return false;
  }
  return Symbol.asyncIterator in source;
}
var isUndefined = (obj) => typeof obj === "undefined";
var isNil = (val) => isUndefined(val) || val === null;
var isObject = (fn) => !isNil(fn) && typeof fn === "object";
function toDataString(data) {
  if (isObject(data)) {
    return toDataString(JSON.stringify(data));
  }
  return data.split(/\r\n|\r|\n/).map((line) => `data: ${line}
`).join("");
}
function transform(message) {
  let data = message.event ? `event: ${message.event}
` : "";
  data += message.id ? `id: ${message.id}
` : "";
  data += message.retry ? `retry: ${message.retry}
` : "";
  data += message.data ? toDataString(message.data) : "";
  data += "\n";
  return data;
}

// src/plugin-websocket.ts
import { Buffer as Buffer4 } from "node:buffer";
import fp2 from "fastify-plugin";

// src/websocket-server.ts
import { Buffer as Buffer3 } from "node:buffer";
import { EventEmitter as EventEmitter3 } from "eventemitter3";
import { Duplex } from "streamx";
import uws2 from "uWebSockets.js";
var defaultWebSocketConfig = {
  compression: uws2.SHARED_COMPRESSOR,
  maxPayloadLength: 16 * 1024 * 1024,
  idleTimeout: 16
};
var SEP = "!";
var SEP_BUFFER = Buffer3.from(SEP);
var WebSocket = class _WebSocket extends EventEmitter3 {
  namespace;
  connection;
  static allocTopic(namespace, topic) {
    if (topic[kTopic]) {
      return topic;
    }
    const buf = Buffer3.concat([
      namespace,
      SEP_BUFFER,
      Buffer3.isBuffer(topic) ? topic : Buffer3.from(topic)
    ]);
    buf[kTopic] = true;
    return buf;
  }
  constructor(namespace, connection, topics = {}) {
    super();
    this.namespace = namespace;
    this.connection = connection;
    connection.websocket = this;
    this.topics = topics;
    this[kEnded] = false;
  }
  get uws() {
    return true;
  }
  allocTopic(topic) {
    if (this.topics[topic]) {
      return this.topics[topic];
    }
    return _WebSocket.allocTopic(this.namespace, topic);
  }
  send(message, isBinary, compress) {
    if (this[kEnded]) {
      return;
    }
    return this.connection.send(message, isBinary, compress);
  }
  publish(topic, message, isBinary, compress) {
    if (this[kEnded]) {
      return;
    }
    return this.connection.publish(this.allocTopic(topic), message, isBinary, compress);
  }
  subscribe(topic) {
    if (this[kEnded]) {
      return;
    }
    return this.connection.subscribe(this.allocTopic(topic));
  }
  unsubscribe(topic) {
    if (this[kEnded]) {
      return;
    }
    return this.connection.unsubscribe(this.allocTopic(topic));
  }
  isSubscribed(topic) {
    if (this[kEnded]) {
      return false;
    }
    return this.connection.isSubscribed(this.allocTopic(topic));
  }
  getTopics() {
    if (this[kEnded]) {
      return [];
    }
    return this.connection.getTopics().map((topic) => topic.slice(topic.indexOf(SEP) + 1));
  }
  close() {
    if (this[kEnded]) {
      return;
    }
    this[kEnded] = true;
    return this.connection.close();
  }
  end(code, shortMessage) {
    if (this[kEnded]) {
      return;
    }
    this[kEnded] = true;
    return this.connection.end(code, shortMessage);
  }
  cork(cb) {
    if (this[kEnded]) {
      return;
    }
    return this.connection.cork(cb);
  }
  getBufferedAmount() {
    if (this[kEnded]) {
      return 0;
    }
    return this.connection.getBufferedAmount();
  }
  ping(message) {
    if (this[kEnded]) {
      return;
    }
    return this.connection.ping(message);
  }
};
var WebSocketServer = class extends EventEmitter3 {
  constructor(options2 = {}) {
    super();
    this.options = { ...options2, ...defaultWebSocketConfig };
    this.connections = /* @__PURE__ */ new Set();
  }
  addServer(server) {
    const { options: options2 } = this;
    const app = server[kApp];
    const listenerHandler = server[kHandler];
    app.ws("/*", {
      upgrade: async (res, req, context) => {
        const method = req.getMethod().toUpperCase();
        const socket = new HTTPSocket(server, res, method === "GET" || method === "HEAD");
        const request = new Request(req, socket, method);
        const response = new Response(socket);
        request[kWs] = context;
        server.emit("upgrade", request, socket);
        listenerHandler(request, response);
      },
      open: (ws) => {
        this.connections.add(ws);
        ws.handler(ws);
        this.emit("open", ws);
      },
      close: (ws, code, message) => {
        this.connections.delete(ws);
        ws.websocket[kEnded] = true;
        ws.req.socket.destroy();
        const _message = message instanceof ArrayBuffer ? Buffer3.from(message) : message;
        ws.websocket.emit("close", code, _message);
        this.emit("close", ws, code, _message);
      },
      drain: (ws) => {
        ws.websocket.emit("drain");
        this.emit("drain", ws);
      },
      message: (ws, message, isBinary) => {
        const _message = message instanceof ArrayBuffer ? Buffer3.from(message) : message;
        ws.websocket.emit("message", _message, isBinary);
        this.emit("message", ws, _message, isBinary);
      },
      ping: (ws, message) => {
        const _message = message instanceof ArrayBuffer ? Buffer3.from(message) : message;
        ws.websocket.emit("ping", _message);
        this.emit("ping", ws, _message);
      },
      pong: (ws, message) => {
        const _message = message instanceof ArrayBuffer ? Buffer3.from(message) : message;
        ws.websocket.emit("pong", _message);
        this.emit("pong", ws, _message);
      },
      ...options2
    });
  }
};

// src/plugin-websocket.ts
function defaultErrorHandler(err, request) {
  request.log.error(err);
  request.raw.destroy(err);
}
function fastifyUws(fastify, opts, next) {
  const { server } = fastify;
  const { errorHandler = defaultErrorHandler, options: options2 } = opts;
  if (errorHandler && typeof errorHandler !== "function") {
    return next(new Error("invalid errorHandler function"));
  }
  const websocketServer = new WebSocketServer(options2);
  server[kWs] = websocketServer;
  fastify.decorate("websocketServer", websocketServer);
  fastify.addHook("onRoute", (routeOptions) => {
    const isWebSocket = !!routeOptions.websocket;
    if (!isWebSocket || routeOptions.method === "HEAD" || routeOptions.method === "OPTIONS") {
      return;
    }
    const wsOptions = typeof routeOptions.ws === "object" ? routeOptions.ws : {};
    const handler = routeOptions.handler;
    const namespace = Buffer4.from(routeOptions.url);
    const topics = {};
    if (wsOptions.topics) {
      for (const topic of wsOptions.topics) {
        topics[topic] = WebSocket.allocTopic(namespace, topic);
      }
    }
    routeOptions.handler = function(request, reply) {
      const requestRaw = request.raw;
      if (requestRaw[kWs]) {
        reply.hijack();
        const uRes = requestRaw.socket[kRes];
        requestRaw.socket[kWs] = true;
        if (requestRaw.socket.aborted || requestRaw.socket.destroyed) {
          return;
        }
        uRes.upgrade(
          {
            req: requestRaw,
            handler: (ws) => {
              const conn = new WebSocket(namespace, ws, topics);
              let result;
              try {
                requestRaw.once("error", () => {
                  conn.close();
                });
                requestRaw.once("close", () => {
                  conn.end();
                });
                result = handler.call(this, conn, request, reply);
              } catch (err) {
                return errorHandler.call(this, err, conn, request, reply);
              }
              if (result && typeof result.catch === "function") {
                result.catch((err) => errorHandler.call(this, err, conn, request, reply));
              }
            }
          },
          requestRaw.headers["sec-websocket-key"],
          requestRaw.headers["sec-websocket-protocol"],
          requestRaw.headers["sec-websocket-extensions"],
          requestRaw[kWs]
        );
      } else {
        return handler.call(this, request, reply);
      }
    };
  });
  next();
}
var plugin_websocket_default = fp2(fastifyUws, {
  fastify: "5.x",
  name: "@fastify/websocket"
});

// src/fastify-uws.ts
var serverFactory = (handler, opts) => new Server(handler, opts);
export {
  plugin_eventsource_default as eventsource,
  serverFactory,
  plugin_websocket_default as websocket
};
