import React from 'react'
import { Link } from '@tanstack/react-router'

export default function AboutPage() {
    return (
        <div className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-4">About Wavefunc SSR</h1>
            <p className="mb-4">
                This is a server-side rendered React application built with Bun and TanStack Router. It demonstrates how
                to implement SSR in a modern React application.
            </p>
            <div className="mb-4">
                <Link to="/" className="text-blue-500 hover:underline">
                    Back to Home
                </Link>
            </div>
        </div>
    )
}
