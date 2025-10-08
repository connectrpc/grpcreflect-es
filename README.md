# Grpcreflect

[![License](https://img.shields.io/github/license/connectrpc/grpcreflect-es?color=blue)](./LICENSE)
[![Build](https://github.com/connectrpc/grpcreflect-es/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/connectrpc/grpcreflect-es/actions/workflows/ci.yaml)
[![NPM Version](https://img.shields.io/npm/v/@connectrpc/grpcreflect/latest?color=green&label=%40connectrpc%2Fgrpcreflect)](https://www.npmjs.com/package/@connectrpc/grpcreflect)

[@connectrpc/grpcreflect](https://www.npmjs.com/package/@connectrpc/grpcreflect) 
adds support for gRPC's server reflection API to any server built with [@connectrpc/connect][connect-es]. With server reflection enabled, ad-hoc debugging tools can call your gRPC-compatible handlers and print the responses without a copy of the schema.

The exposed reflection API is wire compatible with Google's gRPC
implementations, so it works with [grpcurl], [grpcui], and many
other tools.

## Installation

```bash
npm install @connectrpc/grpcreflect
```

## A small example

TODO: 

## Ecosystem

* [connect-es]: the Connect runtime
* [examples-es](https://github.com/connectrpc/examples-es):
  Examples for using Connect with various TypeScript web frameworks and tooling
* [connect-query-es](https://github.com/connectrpc/connect-query-es):
  TypeScript-first expansion pack for TanStack Query that gives you Protobuf superpowers
* [connect-playwright-es](https://github.com/connectrpc/connect-playwright-es):
  Playwright tests for your Connect application
* [connect-swift](https://github.com/connectrpc/connect-swift):
  Idiomatic gRPC & Connect RPCs for Swift
* [connect-go](https://github.com/connectrpc/connect-go):
  Go implementation of gRPC, gRPC-Web, and Connect

## Status: Unstable

This module is unstable. Expect breaking changes as we iterate toward a stable
release.

This project follows semantic versioning. Once we tag
a stable release, we will _not_ make breaking changes without incrementing the
major version.


## License

Offered under the [Apache 2 license](LICENSE).

[connect-es]: https://github.com/connectrpc/connect-es
[grpcui]: https://github.com/fullstorydev/grpcui
[grpcurl]: https://github.com/fullstorydev/grpcurl
