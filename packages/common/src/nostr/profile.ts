import NDK, { type NDKUserProfile } from '@nostr-dev-kit/ndk'

/**
 * Fetch a user profile by pubkey
 * @param ndk NDK instance
 * @param pubkey The user's pubkey
 * @returns Promise with the user profile data or null if not found
 */
export async function fetchProfileByPubkey(ndk: NDK, pubkey: string): Promise<NDKUserProfile | null> {
    try {
        const user = ndk.getUser({ pubkey })
        const profile = await user.fetchProfile()

        if (!profile) {
            return null
        }

        return {
            name: profile.name,
            displayName: profile.displayName,
            about: profile.about,
            picture: profile.picture,
            banner: profile.banner,
            website: profile.website,
            nip05: profile.nip05,
        }
    } catch (error) {
        console.error(`Error fetching profile:`, error)
        return null
    }
}

/**
 * Generate a truncated display name from profile data
 * @param profile The user profile
 * @param fallbackPrefix Prefix to use if no name is available
 * @returns A display name string
 */
export function getDisplayName(profile: NDKUserProfile | null, fallbackPrefix: string = 'User'): string {
    if (!profile) return `${fallbackPrefix}`
    return profile.displayName || profile.name || `${fallbackPrefix}`
}

/**
 * Truncate a profile description to be suitable for OpenGraph tags
 * @param profile The user profile
 * @param maxLength Maximum length for the description
 * @param fallback Fallback description if none is available
 * @returns A formatted description string
 */
export function getProfileDescription(
    profile: NDKUserProfile | null,
    maxLength: number = 150,
    fallback: string = 'A Nostr user on Wavefunc',
): string {
    if (!profile) return fallback
    if (!profile.about) return `Check out ${getDisplayName(profile)}'s profile on Wavefunc`

    return profile.about.length > maxLength ? profile.about.substring(0, maxLength - 3) + '...' : profile.about
}
