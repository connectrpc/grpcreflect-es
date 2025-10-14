# @connectrpc/grpcreflect

`@connectrpc/grpcreflect` adds support for gRPC's server reflection API to any server built with [@connectrpc/connect][connect-es]. With server reflection enabled, ad-hoc debugging tools can call your gRPC-compatible handlers and print the responses without a copy of the schema.

The exposed reflection API is wire compatible with Google's gRPC
implementations, so it works with [grpcurl], [grpcui], and many
other tools.

To get started, head over to the [docs](https://github.com/connectrpc/grpcreflect-es) for an introduction.

[connect-es]: https://github.com/connectrpc/connect-es
[grpcui]: https://github.com/fullstorydev/grpcui
[grpcurl]: https://github.com/fullstorydev/grpcurl