## [0.6.0](https://github.com/[secure]/mcp-[secure]/compare/v0.5.1...v0.6.0) (2026-11-01)

### Features

* support private CAs and client certificates ([637039d](https://github.com/[secure]/mcp-[secure]/commit/637039dbc64e90c88c593fd00579acebcdd1e422))

## [0.5.1](https://github.com/[secure]/mcp-[secure]/compare/v0.5.0...v0.5.1) (2026-11-01)

### Bug Fixes

* bundle the extension and shrink the VSIX ([8450044](https://github.com/[secure]/mcp-[secure]/commit/8450044a069828816e13530f0e4ae70655e5390f))

## [0.5.0](https://github.com/[secure]/mcp-inspector/compare/v0.4.0...v0.5.0) (2026-11-01)

### Features

* **auth:** add a shared OAuth provider and callbacks ([b27a196](https://github.com/[secure]/mcp-inspector/commit/b27a196572ef411deab0b2d62e6f4d35d1d29f32))
* **transport:** sign in to OAuth-protected servers ([88ca6fa](https://github.com/[secure]/mcp-inspector/commit/88ca6fab38e9ace4b66b4cd3a4d16acb68cbdde4))
* **ui:** choose sign-in or a static token ([493db1e](https://github.com/[secure]/mcp-inspector/commit/493db1e43456a83dad7eb926cc762cfdd8bb735b))
* **ui:** pretty-print results and copy them ([c353a2f](https://github.com/[secure]/mcp-inspector/commit/c353a2ff18ec6f4f3d675c3a2be24df2a9f77ba2))
* **ui:** show tool execution progress and results ([7d7aed0](https://github.com/[secure]/mcp-inspector/commit/7d7aed0e495451f04418d44f15b928924ec7c76c))

### Bug Fixes

* **auth:** keep the web OAuth callback valid ([f065fe2](https://github.com/[secure]/mcp-inspector/commit/f065fe21fb37940a01d96910c13c5609d7084137))
* **ui:** drop duplicate connection notifications ([a3dcb43](https://github.com/[secure]/mcp-inspector/commit/a3dcb4301982131d42e1fdb54167c3269542ebb6))
* **ui:** escape the newline in the webview result renderer ([7a03133](https://github.com/[secure]/mcp-inspector/commit/7a03133e313e0db593bbd3d976fb6ee663307aba))

## [0.4.0](https://github.com/[secure]/mcp-inspector/compare/v0.3.1...v0.4.0) (2026-11-01)

### Features

* detect Streamable HTTP or SSE automatically ([#33](https://github.com/[secure]/mcp-inspector/issues/33)) ([127e881](https://github.com/[secure]/mcp-inspector/commit/127e8813652d58222468de7433df669f11949f59))

## [0.3.1](https://github.com/[secure]/mcp-inspector/compare/v0.3.0...v0.3.1) (2026-11-01)

### Bug Fixes

* explain 404 and 405 connection failures ([#32](https://github.com/[secure]/mcp-inspector/issues/32)) ([40d8c56](https://github.com/[secure]/mcp-inspector/commit/40d8c56154456cc8f92e70d14aa2afcf1bdc93fa))

## [0.3.0](https://github.com/[secure]/mcp-inspector/compare/v0.2.1...v0.3.0) (2026-11-01)

### Features

* connect to Streamable HTTP servers ([fbf8b4f](https://github.com/[secure]/mcp-inspector/commit/fbf8b4ff828137c4837bf7dd720c34afe943b864)), closes [#5](https://github.com/[secure]/mcp-inspector/issues/5) [#5](https://github.com/[secure]/mcp-inspector/issues/5)
* send custom headers with remote connections ([cf3cd90](https://github.com/[secure]/mcp-inspector/commit/cf3cd90843a809080dbdd10ee7e87f8456e47d36)), closes [#5](https://github.com/[secure]/mcp-inspector/issues/5)
* **ui:** rebuild the panel and add a STDIO file picker ([b870f5c](https://github.com/[secure]/mcp-inspector/commit/b870f5c083604400472581be445f054ab01c3ccb))

### Bug Fixes

* keep the connection form when the panel is hidden ([b819948](https://github.com/[secure]/mcp-inspector/commit/b819948024ade703e4d288291ef75651b16ac967)), closes [#5](https://github.com/[secure]/mcp-inspector/issues/5)
* **web:** report a blocked request without the raw fetch noise ([c056375](https://github.com/[secure]/mcp-inspector/commit/c05637521c99bf375511c71663fa26edad8d86ca))

## [0.2.1](https://github.com/[secure]/mcp-inspector/compare/v0.2.0...v0.2.1) (2026-11-01)

### Bug Fixes

* simplify the CORS failure message ([#29](https://github.com/[secure]/mcp-inspector/issues/29)) ([e146730](https://github.com/[secure]/mcp-inspector/commit/e14673082a822472abb514a46b1f2822e72e37de))

## [0.2.0](https://github.com/[secure]/mcp-inspector/compare/v0.1.0...v0.2.0) (2026-11-01)

### Features

* offer the relay after a failed web connection ([#28](https://github.com/[secure]/mcp-inspector/issues/28)) ([797eb4f](https://github.com/[secure]/mcp-inspector/commit/797eb4fe7c7b002d6067903de7f0fb8430186b99))

## [0.1.0](https://github.com/[secure]/mcp-inspector/compare/v0.0.4...v0.1.0) (2026-11-01)

### Features

* support VS Code for the Web with SSE ([#27](https://github.com/[secure]/mcp-inspector/issues/27)) ([af34f7c](https://github.com/[secure]/mcp-inspector/commit/af34f7c5a63a6869075396115671d6fd5650b8e9))

## [0.0.4](https://github.com/Dhananjay-JSR/mcp-inspector/compare/v0.0.3...v0.0.4) (2026-11-01)

### Bug Fixes

* **ci:** run the release workflow on node 22 ([#15](https://github.com/Dhananjay-JSR/mcp-inspector/issues/15)) ([01c8392](https://github.com/Dhananjay-JSR/mcp-inspector/commit/01c83920067ff3391e8c38c63908c092712619e6))

# Change Log

All notable changes to the "mcp--inspector" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.1] - 2025-03-29

- Initial release
- Tool List Support
- Transport Support (STDIO / SSE)

## [0.0.2] - 2025-03-29

- Tool Execution and Viewer Support
