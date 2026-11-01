import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	// Pin the VS Code version so local runs and CI always test against the
	// minimum supported editor version declared in package.json (engines.vscode).
	version: '1.98.0',
	// Flags required to run VS Code headlessly inside CI containers.
	launchArgs: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
