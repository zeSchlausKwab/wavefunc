import { Card, CardContent } from '@wavefunc/ui/components/ui/card'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
    component: About,
})

function About() {
    return (
        <div>
            <h1 className="text-3xl font-bold my-12 font-heading text-center bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-transparent bg-clip-text">
                About Wavef(u)nc 🎵✨
            </h1>

            <Card className="relative mb-12 mt-8">
                <CardContent className="relative p-6 rounded-xl">
                    <h2 className="text-xl font-semibold mb-4 flex items-center">
                        <span className="text-2xl mr-2">🎧</span> What is Wavef(u)nc?
                    </h2>
                    <p className="mb-4 text-gray-800">
                        Wavef(u)nc is a decentralized internet radio discovery platform built on the Nostr protocol. It
                        allows you to discover, share, and create lists of your favorite radio stations within the Nostr
                        community. 🚀
                    </p>
                    <p className="mb-4 text-gray-800">
                        We don't host any streams ourselves - instead, we publish and display Nostr events that link to
                        existing radio streams around the world, creating a censorship-resistant directory that remains
                        under community control. 🔒💯
                    </p>
                </CardContent>
            </Card>

            <Card className="mb-12">
                <CardContent className="p-6 rounded-xl">
                    <h2 className="text-xl font-semibold mb-4 flex items-center">
                        <span className="text-2xl mr-2">⚙️</span> How it Works
                    </h2>
                    <div className="space-y-6">
                        <div className="bg-gradient-to-tr from-blue-50 to-blue-100 p-5 rounded-lg border-l-4 border-blue-400 shadow-sm">
                            <h3 className="font-medium mb-2 text-blue-800 flex items-center">
                                <span className="mr-2">🔑</span> Nostr Integration
                            </h3>
                            <p className="text-gray-700">
                                Wavef(u)nc is built on Nostr (Notes and Other Stuff Transmitted by Relays), a simple,
                                open protocol that enables a truly censorship-resistant and global social network. All
                                station information is cryptographically signed and can be verified by anyone.
                            </p>
                        </div>

                        <div className="bg-gradient-to-tr from-purple-50 to-purple-100 p-5 rounded-lg border-l-4 border-purple-400 shadow-sm">
                            <h3 className="font-medium mb-2 text-purple-800 flex items-center">
                                <span className="mr-2">🎹</span> Adding Radio Stations
                            </h3>
                            <p className="text-gray-700">
                                Once logged in with your Nostr identity, you can add radio stations by clicking the "+"
                                button in the header. Simply provide the stream URL, station details, and publish it to
                                the Nostr network. All streams are hosted externally - we just provide the directory! 📡
                            </p>
                        </div>

                        <div className="bg-gradient-to-tr from-green-50 to-green-100 p-5 rounded-lg border-l-4 border-green-400 shadow-sm">
                            <h3 className="font-medium mb-2 text-green-800 flex items-center">
                                <span className="mr-2">🔍</span> Discovering Stations
                            </h3>
                            <p className="text-gray-700">
                                Browse through radio stations created by other users in the Discovery feed. Filter by
                                genres, creators, or regions to find exactly what you're looking for! Tune in directly
                                from the app. 🎵 👂
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="mb-12 p-6 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl">
                <CardContent className="p-6 rounded-xl">
                    <h2 className="text-xl font-semibold mb-4 flex items-center">
                        <span className="text-2xl mr-2">🚀</span> Getting Started
                    </h2>
                    <ol className="list-decimal pl-5 space-y-4">
                        <li className="p-2 rounded-md bg-white bg-opacity-60">
                            <strong className="text-indigo-700">Use Your Existing Nostr Key or Create One</strong> 👤
                            <p className="text-gray-700 mt-1">
                                Already have a Nostr key? Great! If not, you can generate a new private key right in the
                                app. You can also use NIP-07 browser extensions like Alby or nos2x.
                            </p>
                        </li>
                        <li className="p-2 rounded-md bg-white bg-opacity-60">
                            <strong className="text-indigo-700">Sign In</strong> 🔑
                            <p className="text-gray-700 mt-1">
                                Click the "Sign In" button to log in with your Nostr key. You can either use your
                                browser extension, scan a QR code with a mobile app, use NIP-46 remote signers like
                                Amber, or enter your private key (nsec). Your key never leaves your device!
                            </p>
                        </li>
                        <li className="p-2 rounded-md bg-white bg-opacity-60">
                            <strong className="text-indigo-700">Explore or Add Stations</strong> 🎵
                            <p className="text-gray-700 mt-1">
                                Start exploring available radio stations or add your favorite stations by clicking the
                                "+" button in the header. Create personal favorite lists to organize your radio
                                experience!
                            </p>
                        </li>
                    </ol>
                </CardContent>
            </Card>

            <Card className="mt-10">
                <CardContent className="p-6 rounded-xl">
                    <h2 className="text-xl font-semibold mb-4 flex items-center">
                        <span className="text-2xl mr-2">⚠️</span> Important Notes
                    </h2>
                    <div className="bg-gradient-to-r from-amber-100 to-amber-50 border-l-4 border-amber-500 p-5 rounded-lg shadow-sm">
                        <p className="flex items-start">
                            <span className="text-amber-500 font-bold mr-2">📝</span>
                            <span className="text-gray-700">
                                This app is currently operating with a limited relay that will eventually be reset. This
                                is an experimental application, and content may not be permanently stored. For long-term
                                content preservation, consider using multiple Nostr relays. Remember that we don't host
                                any radio streams - we only provide links to existing streams around the web. ✨
                            </span>
                        </p>
                    </div>
                </CardContent>
            </Card>

            <div className="mt-16 pt-8 border-t border-gray-200 text-center">
                <p className="text-purple-600 font-semibold">Made with 💜 for the Nostr community</p>
            </div>
        </div>
    )
}
