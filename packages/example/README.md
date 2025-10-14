# @connectrpc/grpcreflect Example

The example demonstrates the `@connectrpc/grpcreflect` package to expose gRPC reflection APIs.

## Running the Example

Start the server:

```sh
npm start
```

The server runs on `http://localhost:8080` and exposes the gRPC Reflection APIs.

## Testing with buf curl

[buf curl](https://buf.build/docs/curl/usage) can automatically use the reflection service to discover available services and methods.

### List all services

```sh
buf curl --list-methods --http2-prior-knowledge http://localhost:8080
```

This will output:
```
example.v1.UserService/CreateUser
```

### Call the UserService

Once reflection is enabled, you can call any service without needing local proto files:

```sh
buf curl --http2-prior-knowledge --reflect \
  --data '{"email": "test@example.com"}' \
  http://localhost:8080/example.v1.UserService/CreateUser
```

Response:
```json
{
  "user": {
    "email": "test@example.com"
  }
}
```