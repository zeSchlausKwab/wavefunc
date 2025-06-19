import { Progress } from '@wavefunc/ui/components/ui/progress'

const RECORDING_DURATION = 5

export function ProgressToast({ progress, timeRemaining }: { progress: number; timeRemaining: number }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
                <span>Capturing audio...</span>
                <span>{timeRemaining}s</span>
            </div>
            <Progress value={progress} className="w-full" />
        </div>
    )
}
