# @connectrpc/grpcreflect

Adds [gRPC server reflection](https://github.com/grpc/grpc/blob/master/doc/server-reflection.md) to servers built with [@connectrpc/connect][connect-es]. With reflection enabled, tools like [grpcurl], [grpcui], and [buf curl][buf-curl] can list your services, describe your messages, and call your RPCs without a copy of your `.proto` files.

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

```console
$ grpcurl -plaintext localhost:8080 list
example.v1.UserService
grpc.reflection.v1.ServerReflection
grpc.reflection.v1alpha.ServerReflection
```

Both `grpc.reflection.v1` and `grpc.reflection.v1alpha` are supported. Clients call reflection with the gRPC protocol over HTTP/2, so use a server that supports HTTP/2, such as Node.js `http2` or Fastify.

For options, requirements, and more examples, see the [documentation on GitHub](https://github.com/connectrpc/grpcreflect-es#readme).

[buf-curl]: https://buf.build/docs/curl/usage
[connect-es]: https://github.com/connectrpc/connect-es
[grpcui]: https://github.com/fullstorydev/grpcui
[grpcurl]: https://github.com/fullstorydev/grpcurl
