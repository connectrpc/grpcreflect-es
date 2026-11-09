# grpcreflect-es

[![License](https://img.shields.io/github/license/connectrpc/grpcreflect-es?color=blue)](./LICENSE)
[![Build](https://github.com/connectrpc/grpcreflect-es/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/connectrpc/grpcreflect-es/actions/workflows/ci.yaml)
[![NPM Version](https://img.shields.io/npm/v/@connectrpc/grpcreflect/latest?color=green&label=%40connectrpc%2Fgrpcreflect)](https://www.npmjs.com/package/@connectrpc/grpcreflect)

[@connectrpc/grpcreflect](https://www.npmjs.com/package/@connectrpc/grpcreflect) adds [gRPC server reflection](https://github.com/grpc/grpc/blob/master/doc/server-reflection.md) to servers built with [@connectrpc/connect][connect-es]. With reflection enabled, tools like [grpcurl], [grpcui], [buf curl][buf-curl], and Postman can list your services, describe your messages, and call your RPCs without a copy of your `.proto` files.

It implements both `grpc.reflection.v1` and the older `grpc.reflection.v1alpha`, and is wire compatible with the reflection services in gRPC's official implementations.

## Installation

```bash
npm install @connectrpc/grpcreflect
```

`@bufbuild/protobuf` (v2.5.0 or later) and `@connectrpc/connect` (v2) are peer dependencies. You'll already have them if you use Connect.

## Usage

Call `registerReflectionServices` with your router:

```ts
import * as http2 from "node:http2";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { registerReflectionServices } from "@connectrpc/grpcreflect";
import { UserService } from "./gen/example/v1/user_pb.js";

const handler = connectNodeAdapter({
  routes(router) {
    router.service(UserService, {
      // ...
    });
    registerReflectionServices(router);
  },
});

// Reflection clients require HTTP/2.
http2.createServer(handler).listen(8080);
```

That's all. The reflection services describe every service registered on the router, including services registered after this call, and the reflection services themselves.

Now you can explore the server:

```console
$ grpcurl -plaintext localhost:8080 list
example.v1.UserService
grpc.reflection.v1.ServerReflection
grpc.reflection.v1alpha.ServerReflection

$ grpcurl -plaintext localhost:8080 describe example.v1.CreateUserRequest
example.v1.CreateUserRequest is a message:
message CreateUserRequest {
  string email = 1;
}

$ grpcurl -plaintext -d '{"email": "test@example.com"}' localhost:8080 example.v1.UserService/CreateUser
{
  "user": {
    "email": "test@example.com"
  }
}
```

With [buf curl][buf-curl]:

```console
$ buf curl --http2-prior-knowledge --list-methods http://localhost:8080
example.v1.UserService/CreateUser
grpc.reflection.v1.ServerReflection/ServerReflectionInfo
grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo
```

See [packages/example](./packages/example) for a runnable example.

### With Fastify

```ts
import { fastify } from "fastify";
import { fastifyConnectPlugin } from "@connectrpc/connect-fastify";
import { registerReflectionServices } from "@connectrpc/grpcreflect";
import { UserService } from "./gen/example/v1/user_pb.js";

// Reflection clients require HTTP/2.
const server = fastify({ http2: true });
await server.register(fastifyConnectPlugin, {
  routes(router) {
    router.service(UserService, {
      // ...
    });
    registerReflectionServices(router);
  },
});
await server.listen({ host: "localhost", port: 8080 });
```

## Options

```ts
registerReflectionServices(router, {
  files: [file_example_v1_options],
  services: [UserService],
});
```

### `files`

Additional files to make available. The files of registered services, and all of their imports, are always included, so you only need this for files that no service imports. The most common case is a file that declares custom options or other extensions, so that clients can resolve them.

### `services`

Limits the services that are listed, given as service descriptors or fully qualified names. The default is to list every service on the router, including the reflection services. Use this to hide services from `list`.

This only affects listing. Clients can still describe any type in the available files, including unlisted services.

## Requirements and limitations

- **HTTP/2 is required.** Reflection is a bidi streaming RPC, and clients call it with the gRPC protocol. Use a server that supports HTTP/2, such as `connectNodeAdapter` with `node:http2`, or Fastify with `http2: true`.
- **Some servers can't serve reflection to clients.** Express, Next.js, Cloudflare Workers, and other fetch-based or HTTP/1.1 servers can register the reflection services without errors, but clients can't call them.
- **Reflection exposes your schema.** Anyone who can reach the server can read the definitions of the services you register. Consider enabling reflection only in development, or only on an internal port.

## Compatibility

- Ships ESM and CommonJS, with type definitions.
- Doesn't depend on Node.js APIs. Tested on Node.js 22, 24, and 26, Bun, Cloudflare Workers (without `nodejs_compat`), and Chromium, Firefox, and WebKit.
- Requires `@bufbuild/protobuf` v2.5.0 or later, and `@connectrpc/connect` v2. CI tests both the oldest and newest supported versions.
- Tested with TypeScript 4.9 through 7.0. Versions before 5.9 need `skipLibCheck` (the default of `tsc --init` for those versions), because of the `@bufbuild/protobuf` type definitions.

## Ecosystem

- [connect-es]: the Connect runtime
- [examples-es](https://github.com/connectrpc/examples-es):
  Examples for using Connect with various TypeScript web frameworks and tooling
- [connect-query-es](https://github.com/connectrpc/connect-query-es):
  TypeScript-first expansion pack for TanStack Query that gives you Protobuf superpowers
- [connect-playwright-es](https://github.com/connectrpc/connect-playwright-es):
  Playwright tests for your Connect application
- [connect-swift](https://github.com/connectrpc/connect-swift):
  Idiomatic gRPC & Connect RPCs for Swift
- [connect-go](https://github.com/connectrpc/connect-go):
  Go implementation of gRPC, gRPC-Web, and Connect

## Status: Unstable

This module is unstable. Expect breaking changes as we iterate toward a stable
release.

This project follows semantic versioning. Once we tag
a stable release, we will _not_ make breaking changes without incrementing the
major version.

## License

Offered under the [Apache 2 license](LICENSE).

[buf-curl]: https://buf.build/docs/curl/usage
[connect-es]: https://github.com/connectrpc/connect-es
[grpcui]: https://github.com/fullstorydev/grpcui
[grpcurl]: https://github.com/fullstorydev/grpcurl
