import * as fastify from 'fastify';
import { RawServerBase, RawServerDefault, FastifyServerFactory } from 'fastify';
import * as http from 'http';

declare const _default$1: (instance: fastify.FastifyInstance<fastify.RawServerDefault, http.IncomingMessage, http.ServerResponse<http.IncomingMessage>, fastify.FastifyBaseLogger, fastify.FastifyTypeProviderDefault>, _: Record<never, never>) => Promise<void>;

declare function fastifyUws(fastify: any, opts: any, next: any): any;
declare const _default: typeof fastifyUws;

declare const serverFactory: FastifyServerFactory<any>;

declare module 'fastify' {
    interface RouteShorthandOptions<RawServer extends RawServerBase = RawServerDefault> {
        websocket?: boolean;
    }
    interface FastifyReply {
        sse(source: MessageEvent): void;
    }
}
interface MessageEvent {
    data?: string | object;
    id?: string;
    event?: string;
    retry?: number;
}

export { _default$1 as eventsource, serverFactory, _default as websocket };
