"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useParams, useRouter } from "next/navigation"
import { useState, useEffect } from "react"

// This would typically come from a database or API
const stations = [
  { id: "1", name: "Jazz FM", genre: "Jazz", url: "http://jazzfm.com" },
  { id: "2", name: "Rock Radio", genre: "Rock", url: "http://rockradio.com" },
  { id: "3", name: "Classical Vibes", genre: "Classical", url: "http://classicalvibes.com" },
]

export default function EditStation() {
  const params = useParams()
  const router = useRouter()
  const [station, setStation] = useState({ name: "", genre: "", url: "" })

  useEffect(() => {
    const stationToEdit = stations.find((s) => s.id === params.id)
    if (stationToEdit) {
      setStation(stationToEdit)
    }
  }, [params.id])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Here you would typically send the updated data to your backend
    console.log("Updated station:", station)
    // Redirect to home page after update
    router.push("/")
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Edit Station</CardTitle>
        <CardDescription>Update the details of the radio station.</CardDescription>
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
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => router.push("/")}>
            Cancel
          </Button>
          <Button type="submit">Update Station</Button>
        </CardFooter>
      </form>
    </Card>
  )
}

