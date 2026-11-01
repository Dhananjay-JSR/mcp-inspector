import * as assert from 'assert';
import { describeFailure } from '../transport/errorHints';

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
});
