#!/usr/bin/env bun
import { build } from 'bun'
import plugin from 'bun-plugin-tailwind'
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

    const result = await build({
        entrypoints: ['./src/client.tsx'],
        outdir: './public/dist',
        minify: process.env.NODE_ENV === 'production',
        plugins: [plugin],
        target: 'browser',
        sourcemap: 'linked',
        define: {
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
        },
    })

    if (result.success) {
        console.log('✅ Client bundle built successfully')
        result.outputs.forEach((output) => {
            console.log(`  - ${output.path} (${output.kind}, ${(output.size / 1024).toFixed(2)} KB)`)
        })
    } else {
        console.error('❌ Client bundle build failed')
        result.logs.forEach((log) => console.error(log))
    }

    console.log(`\n✅ Build completed in ${performance.now() - start}ms\n`)
}

// Run the build process
main().catch((error) => {
    console.error('Build failed:', error)
    process.exit(1)
})
