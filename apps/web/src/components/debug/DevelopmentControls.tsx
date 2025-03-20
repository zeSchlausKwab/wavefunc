import { useToast } from '@/lib/hooks/use-toast'
import config from '@wavefunc/common/config'
export function DevelopmentControls() {
    const { toast } = useToast()

    if (config.app.env !== 'development') {
        return null
    }

    const callDevEndpoint = async (endpoint: string) => {
        try {
            const response = await fetch(
                `http://${import.meta.env.VITE_PUBLIC_HOST}:${import.meta.env.VITE_PUBLIC_API_PORT}/development/${endpoint}`,
                {
                    method: 'POST',
                },
            )
            const data = await response.json()
            toast({
                title: 'Success',
                description: data.message,
            })
        } catch (error) {
            console.error('Error:', error)
            toast({
                title: 'Error',
                description: 'Failed to call development endpoint',
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
