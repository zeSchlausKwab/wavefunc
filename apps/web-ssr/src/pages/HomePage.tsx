import React from "react";
import { Link } from "@tanstack/react-router";

export default function HomePage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">Welcome to Wavefunc SSR</h1>
      <p className="mb-4">This is a server-side rendered React application using Bun and TanStack Router.</p>
      <div className="flex gap-4">
        <Link to="/about" className="text-blue-500 hover:underline">
          About
        </Link>
      </div>
    </div>
  );
} 