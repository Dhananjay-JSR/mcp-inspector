import * as assert from 'assert';
import { buildCurlCommand, describeFailure } from '../transport/errorHints';

suite('Error hints', () => {
	test('suggests /mcp when the URL has no path', () => {
		const failure = describeFailure(
			'Error POSTing to endpoint: Method Not Allowed',
			new URL('https://mcp.deepwiki.com'),
		);

		assert.match(failure.message, /405/);
		assert.match(failure.message, /https:\/\/mcp\.deepwiki\.com\/mcp/);
		assert.strictEqual(
			failure.details,
			'Error POSTing to endpoint: Method Not Allowed',
		);
	});

	test('does not guess a path when one is already set', () => {
		const failure = describeFailure('404 Not Found', new URL('https://example.com/custom'));

		assert.match(failure.message, /404/);
		assert.ok(!failure.message.includes('/mcp'));
	});

	test('explains auth failures', () => {
		assert.match(describeFailure('401 Unauthorized', null).message, /Authorization/);
		assert.match(describeFailure('403 Forbidden', null).message, /token/);
	});

	test('marks network failures as likely CORS', () => {
		const failure = describeFailure('Failed to fetch', null, true);

		assert.strictEqual(failure.corsLikely, true);
		assert.match(failure.message, /browser blocked/);
	});

	test('classifies endpoint and command problems as configuration', () => {
		const notFound = describeFailure('404 Not Found', new URL('https://example.com/custom'));
		const missingCommand = describeFailure('spawn npx ENOENT', null);
		const badUrl = describeFailure('Server URL must start with http:// or https://', null);

		assert.strictEqual(notFound.kind, 'config');
		assert.strictEqual(missingCommand.kind, 'config');
		assert.match(missingCommand.message, /command|path/i);
		assert.strictEqual(badUrl.kind, 'config');
		assert.match(badUrl.message, /http/i);
	});

	test('classifies DNS failures and names the host problem', () => {
		const failure = describeFailure(
			'getaddrinfo ENOTFOUND missing.example',
			new URL('https://missing.example/mcp'),
		);

		assert.strictEqual(failure.kind, 'dns');
		assert.strictEqual(failure.title, 'Host not found');
		assert.match(failure.message, /host|DNS/i);
	});

	test('classifies TLS failures and points at certificate settings', () => {
		const failure = describeFailure(
			'unable to verify the first certificate',
			new URL('https://example.com/mcp'),
		);

		assert.strictEqual(failure.kind, 'tls');
		assert.match(failure.message, /certificate|TLS/i);
		assert.match(failure.message, /CA|settings/i);
	});

	test('classifies the browser CORS flag before the raw text', () => {
		const failure = describeFailure(
			'TypeError: Failed to fetch',
			new URL('https://example.com/mcp'),
			true,
		);

		assert.strictEqual(failure.kind, 'cors');
		assert.strictEqual(failure.corsLikely, true);
	});

	test('classifies authentication failures', () => {
		assert.strictEqual(describeFailure('401 Unauthorized', null).kind, 'auth');
		assert.strictEqual(describeFailure('403 Forbidden', null).kind, 'auth');
		assert.strictEqual(
			describeFailure('invalid_token: the access token expired', null).kind,
			'auth',
		);
	});

	test('classifies unreachable servers as transport failures', () => {
		const failure = describeFailure('connect ECONNREFUSED 127.0.0.1:9000', null);

		assert.strictEqual(failure.kind, 'transport');
		assert.match(failure.message, /running|reachable/i);
	});

	test('classifies malformed responses as protocol failures', () => {
		const failure = describeFailure(
			'Unexpected token < in JSON at position 0',
			new URL('https://example.com/mcp'),
		);

		assert.strictEqual(failure.kind, 'protocol');
		assert.match(failure.message, /JSON|MCP/i);
	});

	test('uses the caller fallback for unclassified errors', () => {
		assert.strictEqual(describeFailure('tool exploded', null, false, 'tool').kind, 'tool');
		assert.strictEqual(describeFailure('something odd', null).kind, 'transport');
	});

	test('keeps plain tool errors in the tool category', () => {
		const failure = describeFailure('tool not found', null, false, 'tool');

		assert.strictEqual(failure.kind, 'tool');
		assert.strictEqual(failure.title, 'Tool call');
		assert.strictEqual(failure.message, 'tool not found');
	});

	test('includes a safe curl command when the endpoint is known', () => {
		const failure = describeFailure('404 Not Found', new URL('https://example.com/mcp'));

		assert.strictEqual(failure.curl, "curl -i 'https://example.com/mcp'");
	});
});

suite('Curl command', () => {
	test('builds a header-free curl for the endpoint', () => {
		assert.strictEqual(
			buildCurlCommand(new URL('https://example.com/mcp?x=1')),
			"curl -i 'https://example.com/mcp?x=1'",
		);
	});

	test('escapes single quotes in the URL', () => {
		assert.strictEqual(
			buildCurlCommand(new URL("https://example.com/a'b")),
			"curl -i 'https://example.com/a'\\''b'",
		);
	});

	test('returns undefined without an endpoint', () => {
		assert.strictEqual(buildCurlCommand(null), undefined);
	});
});
