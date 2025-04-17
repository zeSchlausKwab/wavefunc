import { useEffect, useState } from 'react'
import reactLogo from './assets/react.svg'
import { invoke } from '@tauri-apps/api/core'
import './App.css'
import { subscribeToRadioStations } from '@wavefunc/common'

import NDK, { NDKEvent } from '@nostr-dev-kit/ndk'

function App() {
    const [greetMsg, setGreetMsg] = useState('')
    const [name, setName] = useState('')
    const [ndk, setNdk] = useState<NDK | null>(null)
    const [stations, setStations] = useState<NDKEvent[]>([])

    useEffect(() => {
        const ndk = new NDK({
            explicitRelayUrls: ['wss://relay.wavefunc.live', 'ws://192.168.100.99:3002'],
        })
        setNdk(ndk)

        ndk.connect()
    }, [])

    useEffect(() => {
        // Use a Set to track processed event IDs within this component
        // const processedEvents = new Set<string>()

        console.log(ndk)

        if (!ndk) return

        // Use any type for the event to avoid version incompatibility issues
        const handleEvent: any = (event: NDKEvent) => {
            console.log(event)
            setStations((prev) => [...prev, event])
        }

        // Use type assertion to resolve the NDK version incompatibility
        // @ts-ignore
        const sub = subscribeToRadioStations(ndk, handleEvent)

        return () => {
            sub.stop()
        }
    }, [ndk])

    async function greet() {
        // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
        setGreetMsg(await invoke('greet', { name }))
    }

    return (
        <main className="container">
            <h1>Welcome to Tauri + React + Nostr</h1>

            <div className="row">
                <a href="https://vitejs.dev" target="_blank">
                    <img src="/vite.svg" className="logo vite" alt="Vite logo" />
                </a>
                <a href="https://tauri.app" target="_blank">
                    <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
                </a>
                <a href="https://reactjs.org" target="_blank">
                    <img src={reactLogo} className="logo react" alt="React logo" />
                </a>
            </div>
            <p>Click on the Tauri, Vite, and React logos to learn more.</p>

            <form
                className="row"
                onSubmit={(e) => {
                    e.preventDefault()
                    greet()
                }}
            >
                <input
                    id="greet-input"
                    onChange={(e) => setName(e.currentTarget.value)}
                    placeholder="Enter a name..."
                />
                <button type="submit">Greet</button>
            </form>
            <p>{greetMsg}</p>
            {stations.map((station) => (
                <div key={station.id}>
                    <h2>{station.id}</h2>
                    <p>{JSON.stringify(station.content)}</p>
                </div>
            ))}
        </main>
    )
}

export default App
