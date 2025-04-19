import config from '@wavefunc/common/config'
import { toast } from 'sonner'
export function DevelopmentControls() {
    if (config.app.env !== 'development') {
        return null
    }

    const callDevEndpoint = async (endpoint: string) => {
        try {
            const response = await fetch(
                `http://${process.env.VITE_PUBLIC_HOST}:${process.env.VITE_PUBLIC_API_PORT}/development/${endpoint}`,
                {
                    method: 'POST',
                },
            )
            const data = await response.json()
            toast('Success', {
                description: data.message,
            })
        } catch (error) {
            console.error('Error:', error)
            toast('Error', {
                description: 'Failed to call development endpoint',
                style: {
                    background: 'red',
                },
            })
        }
    }

    return (
        <div className="fixed bottom-30 right-4 flex flex-col gap-2 bg-white p-4 rounded-lg shadow-lg border">
            <h2 className="font-bold mb-2">Development Controls</h2>
            <button
                onClick={() => callDevEndpoint('seed')}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
                Seed Data
            </button>
            <button
                onClick={() => callDevEndpoint('nuke')}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
                Nuke Data
            </button>
            <button
                onClick={() => callDevEndpoint('reset')}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
                Reset Data
            </button>
        </div>
    )
}
