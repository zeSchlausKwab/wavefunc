import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { Settings as SettingsIcon } from 'lucide-react'

export const Route = createFileRoute('/settings')({
    component: Settings,
})

function Settings() {
    return (
        <div className="container mx-auto py-8">
            <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <SettingsIcon className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl font-bold">Device Settings</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-lg font-medium mb-2">Device Information</h3>
                            <p className="text-muted-foreground">Configure your device settings and preferences.</p>
                        </div>

                        {/* This would be populated with actual settings */}
                        <div className="border rounded-md p-4 bg-muted/20">
                            <p className="text-sm text-muted-foreground">Settings would be displayed here</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
