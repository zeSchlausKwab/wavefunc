"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function AddStation() {
  const router = useRouter()
  const [station, setStation] = useState({ name: "", genre: "", url: "", imageUrl: "" })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Here you would typically send the data to your backend
    console.log("New station:", station)
    // Reset the form and redirect to home page
    setStation({ name: "", genre: "", url: "", imageUrl: "" })
    router.push("/")
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Add New Station</CardTitle>
        <CardDescription>Enter the details of the radio station you want to add.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Station Name</Label>
            <Input
              id="name"
              value={station.name}
              onChange={(e) => setStation({ ...station, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="genre">Genre</Label>
            <Input
              id="genre"
              value={station.genre}
              onChange={(e) => setStation({ ...station, genre: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="url">Stream URL</Label>
            <Input
              id="url"
              type="url"
              value={station.url}
              onChange={(e) => setStation({ ...station, url: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="imageUrl">Image URL</Label>
            <Input
              id="imageUrl"
              type="url"
              value={station.imageUrl}
              onChange={(e) => setStation({ ...station, imageUrl: e.target.value })}
              required
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full">
            Add Station
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

