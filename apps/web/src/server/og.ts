/**
 * Generate OpenGraph meta tags based on the route
 * Returns only the meta tags to be injected into the HTML
 */
export async function generateOpenGraphTags(req: Request): Promise<string> {
    const url = new URL(req.url)
    const path = url.pathname
    let title = 'Wavefunc'
    let description = 'A decentralized nostr app'
    let image = `${new URL('/images/og-image.png', req.url).href}`

    // Extract route parameters
    const stationMatch = path.match(/^\/station\/([^\/]+)/)
    const profileMatch = path.match(/^\/profile\/([^\/]+)/)

    // Handle specific routes
    if (stationMatch) {
        const stationId = stationMatch[1]
        title = `Station ${stationId} | Wavefunc`
        description = `Listen to Station ${stationId} on Wavefunc - a decentralized nostr app`
        // You might want to generate station-specific images or fetch metadata

        // For now we'll use the main OG image
        // TODO: Fetch station metadata if available
    } else if (profileMatch) {
        const profileId = profileMatch[1]
        title = `${profileId}'s Profile | Wavefunc`
        description = `Check out ${profileId}'s profile on Wavefunc - a decentralized nostr app`
        // You might want to generate profile-specific images or fetch metadata

        // For now we'll use the main OG image
        // TODO: Fetch profile metadata if available
    }

    // Ensure the image URL is absolute
    if (!image.startsWith('http')) {
        image = new URL(image, req.url).href
    }

    // Generate the OpenGraph meta tags to be injected
    return `
    <!-- Primary Meta Tags -->
    <meta name="title" content="${title}">
    <meta name="description" content="${description}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${req.url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:logo" content="${new URL('/images/logo.png', req.url).href}" />
    <meta property="og:site_name" content="Wavefunc" />
    
    <!-- Twitter / Telegram -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:image:alt" content="${title}" />
    
    <!-- Additional Telegram-friendly tags -->
    <meta name="telegram:title" content="${title}" />
    <meta name="telegram:description" content="${description}" />
    <meta name="telegram:image" content="${image}" />
`
}

/**
 * Inject OpenGraph meta tags into the HTML for bot requests
 */
export async function injectOpenGraphMetadata(html: string, req: Request): Promise<string> {
    const openGraphTags = await generateOpenGraphTags(req)

    // Inject the OpenGraph tags right before the closing head tag
    return html.replace('</head>', `${openGraphTags}</head>`)
}
