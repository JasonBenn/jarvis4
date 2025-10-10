const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	// Build main extension
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});

	// Build test exports (for CLI testing)
	const testCtx = await esbuild.context({
		entryPoints: [
			'src/test-exports.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: false,
		sourcemap: false,
		platform: 'node',
		outfile: 'dist/test-exports.js',
		logLevel: 'silent',
	});
	if (watch) {
		await ctx.watch();
		await testCtx.watch();
	} else {
		await ctx.rebuild();
		await testCtx.rebuild();
		await ctx.dispose();
		await testCtx.dispose();

		// Copy sql.js WASM file to dist
		const wasmSource = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
		const wasmDest = path.join(__dirname, 'dist', 'sql-wasm.wasm');

		if (fs.existsSync(wasmSource)) {
			fs.copyFileSync(wasmSource, wasmDest);
			console.log('✓ Copied sql-wasm.wasm to dist/');
		} else {
			console.warn('⚠ Warning: sql-wasm.wasm not found at', wasmSource);
		}
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
