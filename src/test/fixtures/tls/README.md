# TLS test fixtures

Self-signed material for the TLS tests only. It is not trusted anywhere else
and is never packaged in the VSIX (`src/**` is excluded from the extension).

- `ca.crt` signs both the server and client certificates.
- `server.crt` has SANs for `localhost`, `127.0.0.1`, and `::1`.
- `client.crt` is presented by the mTLS tests.
- The `.cnf` files document how the certificates were generated.

The certificates expire in 100 years so the tests do not rot. To regenerate,
create a new CA, then sign `server.cnf` and `client.cnf` with it; keep
`server.key` and `client.key` next to their certificates.
