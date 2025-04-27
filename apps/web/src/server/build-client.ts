import { build } from 'bun'
import tailwind from 'bun-plugin-tailwind'

// Build the client-side code before starting the server
export async function buildClient() {
    console.log('🔨 Building client bundle...')

    try {
        const result = await build({
            entrypoints: ['./src/client.tsx'],
            outdir: './public/dist',
            minify: process.env.NODE_ENV === 'production',
            plugins: [tailwind],
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
    } catch (error) {
        console.error('❌ Client bundle build error:', error)
    }
}
