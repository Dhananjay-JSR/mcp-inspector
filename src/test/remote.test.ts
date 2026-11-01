import * as assert from 'assert';
import { preferredTransports, relayUrlFor } from '../transport/endpoint';
import { connectWithFallback } from '../transport/remote';

suite('Remote transport routing', () => {
	test('prefers Streamable HTTP for a /mcp URL', () => {
		assert.deepStrictEqual(preferredTransports(new URL('https://example.com/mcp')), [
			'streamable-http',
			'sse',
		]);
	});

	test('prefers SSE for a /sse URL', () => {
		assert.deepStrictEqual(preferredTransports(new URL('https://example.com/sse')), [
			'sse',
			'streamable-http',
		]);
	});

	test('builds relay URLs for both transports', () => {
		assert.strictEqual(
			relayUrlFor('https://relay.dev/', 'sse', 'https://example.com/sse'),
			'https://relay.dev/sse?url=https%3A%2F%2Fexample.com%2Fsse',
		);
		assert.strictEqual(
			relayUrlFor('https://relay.dev', 'streamable-http', 'https://example.com/mcp'),
			'https://relay.dev/mcp?url=https%3A%2F%2Fexample.com%2Fmcp',
		);
	});

	test('falls back and reports the transport that worked', async () => {
		const tried: string[] = [];
		const result = await connectWithFallback('https://example.com/mcp', {}, async (transport) => {
			tried.push(transport);
			return transport === 'streamable-http'
				? { success: false, error: '405', details: '405 Method Not Allowed' }
				: { success: true, tools: [] };
		});

		assert.deepStrictEqual(tried, ['streamable-http', 'sse']);
		assert.strictEqual(result.success, true);
		assert.strictEqual(result.transport, 'sse');
	});

	test('stops after a blocked browser request', async () => {
		const tried: string[] = [];
		const result = await connectWithFallback('https://example.com/mcp', {}, async (transport) => {
			tried.push(transport);
			return { success: false, error: 'blocked', corsLikely: true };
		});

		assert.deepStrictEqual(tried, ['streamable-http']);
		assert.strictEqual(result.corsLikely, true);
	});
});
