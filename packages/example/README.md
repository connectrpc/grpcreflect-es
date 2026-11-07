# @connectrpc/grpcreflect example

A small server with one service, `example.v1.UserService`, and gRPC server reflection enabled. See [src/index.ts](./src/index.ts) for the code.

## Running the example

From the repository root, install dependencies and build the package:

```sh
npm ci
npx turbo run build --filter=grpcreflect-example
```

Then start the server:

```sh
npm start --workspace packages/example
```

The server listens on `http://localhost:8080` with HTTP/2 (without TLS).

## Exploring with grpcurl

[grpcurl](https://github.com/fullstorydev/grpcurl) uses reflection by default. `-plaintext` is needed because the server doesn't use TLS.

List services:

```console
$ grpcurl -plaintext localhost:8080 list
example.v1.UserService
grpc.reflection.v1.ServerReflection
grpc.reflection.v1alpha.ServerReflection
```

Describe a service or a message:

```console
$ grpcurl -plaintext localhost:8080 describe example.v1.UserService
example.v1.UserService is a service:
service UserService {
  rpc CreateUser ( .example.v1.CreateUserRequest ) returns ( .example.v1.CreateUserResponse );
}
```

Call a method:

```console
$ grpcurl -plaintext -d '{"email": "test@example.com"}' localhost:8080 example.v1.UserService/CreateUser
{
  "user": {
    "email": "test@example.com"
  }
}
```

## Exploring with buf curl

[buf curl](https://buf.build/docs/curl/usage) uses reflection by default. `--http2-prior-knowledge` is needed because the server uses HTTP/2 without TLS.

List methods:

```console
$ buf curl --http2-prior-knowledge --list-methods http://localhost:8080
example.v1.UserService/CreateUser
grpc.reflection.v1.ServerReflection/ServerReflectionInfo
grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo
```

Call a method:

```console
$ buf curl --http2-prior-knowledge --data '{"email": "test@example.com"}' http://localhost:8080/example.v1.UserService/CreateUser
{
  "user": {
    "email": "test@example.com"
  }
}
```

## Exploring with grpcui

[grpcui](https://github.com/fullstorydev/grpcui) opens a web UI for the server in your browser:

```sh
grpcui -plaintext localhost:8080
```
