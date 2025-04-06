import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
    component: About,
})

function About() {
    return (
        <div>
            <h1 className="text-3xl font-bold mb-6 font-press-start-2p text-center bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-transparent bg-clip-text">
                About Wavef(u)nc 🎵✨
            </h1>

            <div className="relative mb-12 mt-8">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-purple-100 rounded-xl opacity-50" />
                <section className="relative p-6 rounded-xl">
                    <h2 className="text-xl font-semibold mb-4 flex items-center">
                        <span className="text-2xl mr-2">🎧</span> What is Wavef(u)nc?
                    </h2>
                    <p className="mb-4 text-gray-800">
                        Wavef(u)nc is a decentralized audio streaming platform built on the Nostr protocol. It allows
                        you to discover, create, and share audio stations with the Nostr community. 🚀
                    </p>
                    <p className="mb-4 text-gray-800">
                        Whether you're looking to share music, podcasts, or any audio content, Wavef(u)nc provides a
                        censorship-resistant platform where your content remains under your control. 🔒💯
                    </p>
                </section>
            </div>

            <section className="mb-12">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                    <span className="text-2xl mr-2">⚙️</span> How it Works
                </h2>
                <div className="space-y-6">
                    <div className="bg-gradient-to-tr from-blue-50 to-blue-100 p-5 rounded-lg border-l-4 border-blue-400 shadow-sm">
                        <h3 className="font-medium mb-2 text-blue-800 flex items-center">
                            <span className="mr-2">🔑</span> Nostr Integration
                        </h3>
                        <p className="text-gray-700">
                            Wavef(u)nc is built on Nostr (Notes and Other Stuff Transmitted by Relays), a simple, open
                            protocol that enables a truly censorship-resistant and global social network. All content is
                            cryptographically signed and can be verified by anyone.
                        </p>
                    </div>

                    <div className="bg-gradient-to-tr from-purple-50 to-purple-100 p-5 rounded-lg border-l-4 border-purple-400 shadow-sm">
                        <h3 className="font-medium mb-2 text-purple-800 flex items-center">
                            <span className="mr-2">🎹</span> Creating Stations
                        </h3>
                        <p className="text-gray-700">
                            Once logged in with your Nostr identity, you can create audio stations by clicking the "+"
                            button in the header. Add audio content, set a title, description, and start sharing with
                            the world! 🌍
                        </p>
                    </div>

                    <div className="bg-gradient-to-tr from-green-50 to-green-100 p-5 rounded-lg border-l-4 border-green-400 shadow-sm">
                        <h3 className="font-medium mb-2 text-green-800 flex items-center">
                            <span className="mr-2">🔍</span> Discovering Content
                        </h3>
                        <p className="text-gray-700">
                            Browse through stations created by other users in the Discovery feed. Filter by tags,
                            creators, or content type to find exactly what you're looking for! 🎵 👀
                        </p>
                    </div>
                </div>
            </section>

            <section className="mb-12 p-6 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                    <span className="text-2xl mr-2">🚀</span> Getting Started
                </h2>
                <ol className="list-decimal pl-5 space-y-4">
                    <li className="p-2 rounded-md bg-white bg-opacity-60">
                        <strong className="text-indigo-700">Create a Nostr Identity</strong> 👤
                        <p className="text-gray-700 mt-1">
                            If you don't already have one, you'll need to create a Nostr identity using apps like Amber,
                            Alby, or any NIP-07 compatible extension.
                        </p>
                    </li>
                    <li className="p-2 rounded-md bg-white bg-opacity-60">
                        <strong className="text-indigo-700">Connect Your Identity</strong> 🔌
                        <p className="text-gray-700 mt-1">
                            Use the login button to connect your Nostr identity to Wavef(u)nc. You can either scan a QR
                            code with a mobile wallet or use extension-based login.
                        </p>
                    </li>
                    <li className="p-2 rounded-md bg-white bg-opacity-60">
                        <strong className="text-indigo-700">Explore or Create</strong> 🎵
                        <p className="text-gray-700 mt-1">
                            Start exploring available stations or create your own by clicking the "+" button in the
                            header.
                        </p>
                    </li>
                </ol>
            </section>

            <section className="mt-10">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                    <span className="text-2xl mr-2">⚠️</span> Important Notes
                </h2>
                <div className="bg-gradient-to-r from-amber-100 to-amber-50 border-l-4 border-amber-500 p-5 rounded-lg shadow-sm">
                    <p className="flex items-start">
                        <span className="text-amber-500 font-bold mr-2">📝</span>
                        <span className="text-gray-700">
                            This app is currently operating with a limited relay that will eventually be reset. This is
                            an experimental application, and content may not be permanently stored. For long-term
                            content preservation, consider using multiple Nostr relays. ✨
                        </span>
                    </p>
                </div>
            </section>

            <div className="mt-16 pt-8 border-t border-gray-200 text-center">
                <p className="text-purple-600 font-semibold">Made with 💜 for the Nostr community</p>
            </div>
        </div>
    )
}
