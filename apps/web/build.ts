#!/usr/bin/env bun
import { build } from 'bun'
// import plugin from 'bun-plugin-tailwind'
import { existsSync } from 'fs'
import { rm } from 'fs/promises'
import path from 'path'

async function main() {
	console.log('\n🚀 Starting build process...\n')

	const outdir = path.join(process.cwd(), 'dist')

	// Clean previous build
	if (existsSync(outdir)) {
		console.log(`🗑️ Cleaning previous build at ${outdir}`)
		await rm(outdir, { recursive: true, force: true })
	}

	const start = performance.now()

	// Build the app
	const result = await build({
		entrypoints: ['./src/index.tsx'],
		outdir,
		// plugins: [plugin],
		minify: true,
		target: 'bun',
		sourcemap: 'linked',
		define: {
			'process.env.NODE_ENV': JSON.stringify('production'),
		},
	})

	// Print the results
	const end = performance.now()

	const formatFileSize = (bytes: number): string => {
		const units = ['B', 'KB', 'MB', 'GB']
		let size = bytes
		let unitIndex = 0

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024
			unitIndex++
		}

		return `${size.toFixed(2)} ${units[unitIndex]}`
	}

	const outputTable = result.outputs.map((output) => ({
		File: path.relative(process.cwd(), output.path),
		Type: output.kind,
		Size: formatFileSize(output.size),
	}))

	console.table(outputTable)
	const buildTime = (end - start).toFixed(2)

	console.log(`\n✅ Build completed in ${buildTime}ms\n`)
}

// Run the build process
main().catch((error) => {
	console.error('Build failed:', error)
	process.exit(1)
})
