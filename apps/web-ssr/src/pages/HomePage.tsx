import React from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export default function HomePage() {
    return (
        <div className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-4">Welcome to Wavefunc SSR</h1>
            <div className="flex flex-col gap-4 w-48">
                <Button>Tailwind Click me</Button>
                <Button variant="secondary">Click me</Button>
                <Button variant="outline">Click me</Button>

                <button>Native Click me</button>
            </div>

            <p className="mb-4">This is a server-side rendered React application using Bun and TanStack Router.</p>
            <div className="flex gap-4">
                <Link to="/about" className="text-blue-500 hover:underline">
                    About
                </Link>
            </div>
        </div>
    )
}
