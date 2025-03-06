import { Button } from "@/components/ui/button";
import { Music2 } from "lucide-react";
import { useState, useRef } from "react";
import { nostrService } from "@/services/ndk";
import { NDKEvent, NDKKind, NostrEvent } from "@nostr-dev-kit/ndk";
import { useAtom } from "jotai";
import { currentStationAtom } from "../atoms/stations";

const JOB_KIND = 5000;
const RESULT_KIND = 6000;
const RECORDING_DURATION = 5; // seconds

interface RecognitionResult {
  title: string;
  artist: string;
  album: string;
  release_date: string;
  song_link: string;
  apple_music: {
    preview: string;
    url: string;
  };
  spotify: {
    preview: string;
    url: string;
  };
}

interface MusicRecognitionButtonProps {
  audioElement: HTMLAudioElement | null;
}

export function MusicRecognitionButton({
  audioElement,
}: MusicRecognitionButtonProps) {
  const [currentStation] = useAtom(currentStationAtom);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = async () => {
    if (!currentStation || !audioElement) {
      console.error("No station or audio element");
      return;
    }

    try {
      console.log("Starting recording process...");
      setIsLoading(true);

      // Get the primary stream URL
      const primaryStream =
        currentStation.streams.find((s: any) => s.primary) ||
        currentStation.streams[0];
      if (!primaryStream) {
        throw new Error("No stream available");
      }

      console.log("Stream URL:", primaryStream.url);

      // Create audio context
      audioContextRef.current = new AudioContext();

      // Create a source from the audio element
      const source =
        audioContextRef.current.createMediaElementSource(audioElement);

      // Create a media stream destination
      const destination =
        audioContextRef.current.createMediaStreamDestination();

      // Connect the source to the destination
      source.connect(destination);
      streamRef.current = destination.stream;

      // Create media recorder with specific MIME type
      mediaRecorderRef.current = new MediaRecorder(streamRef.current, {
        mimeType: "audio/webm;codecs=opus",
      });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        console.log("Data available:", event.data.size, "bytes");
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        console.log(
          "Recording stopped, chunks:",
          audioChunksRef.current.length
        );
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        console.log("Created blob:", audioBlob.size, "bytes");
        await handleRecognize(audioBlob);
      };

      // Start recording
      mediaRecorderRef.current.start(1000); // Collect data every second
      console.log("MediaRecorder started");

      // Stop recording after duration
      setTimeout(() => {
        console.log("Stopping recording...");
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === "recording"
        ) {
          mediaRecorderRef.current.stop();
        }
      }, RECORDING_DURATION * 1000);
    } catch (error) {
      console.error("Error in recording process:", error);
      setIsLoading(false);
    }
  };

  const uploadToBlossom = async (audioBlob: Blob): Promise<string> => {
    console.log("Uploading to Satellite CDN...");

    if (!window.nostr) {
      throw new Error("Nostr extension not found");
    }

    // Create auth event for file upload
    const uploadAuth: NostrEvent = {
      created_at: Math.ceil(Date.now() / 1000),
      kind: 22242,
      content: "Authorize Upload",
      tags: [
        ["name", "sample.mp3"], // Changed to mp3 since that's what AudD expects
        ["size", audioBlob.size.toString()],
        ["label", "music_recognition"],
      ],
      pubkey: nostrService.getNDK().activeUser?.pubkey || "",
      id: "",
      sig: "",
    };

    // Sign the event
    const signedAuth = await window.nostr.signEvent(uploadAuth);

    // Upload to Satellite CDN
    const response = await fetch(
      `https://api.satellite.earth/v1/media/item?auth=${encodeURIComponent(JSON.stringify(signedAuth))}`,
      {
        method: "PUT",
        body: audioBlob,
      }
    );

    if (!response.ok) {
      throw new Error(`Satellite CDN upload error: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("Satellite CDN upload result:", result);

    // Verify we got a valid URL
    if (!result.url) {
      throw new Error("No URL returned from Satellite CDN");
    }

    // Return the CDN URL from the response
    return result.url;
  };

  const handleRecognize = async (audioBlob: Blob) => {
    try {
      // Upload to Blossom
      const blossomUrl = await uploadToBlossom(audioBlob);
      console.log("Uploaded to Blossom:", blossomUrl);

      // Send to DVM
      const requestEvent = new NDKEvent(nostrService.getNDK());
      requestEvent.kind = JOB_KIND;
      requestEvent.content = JSON.stringify({
        type: "music_recognition",
        audioUrl: blossomUrl,
        requestId: Date.now().toString(),
      });

      await requestEvent.sign();

      // Subscribe to the response
      const sub = nostrService.getNDK().subscribe({
        kinds: [RESULT_KIND as NDKKind],
        "#e": [requestEvent.id],
        limit: 1,
      });

      sub.on("event", (event: NDKEvent) => {
        const content = JSON.parse(event.content);
        if (content.type === "audd_response") {
          setResult(content.result);
        } else if (content.type === "audd_error") {
          console.error("Recognition error:", content.error);
        }
        setIsLoading(false);
        sub.stop();
      });

      await requestEvent.publish();

      // Timeout after 10 seconds
      setTimeout(() => {
        if (isLoading) {
          setIsLoading(false);
          sub.stop();
        }
      }, 10000);
    } catch (error) {
      console.error("Error processing recognition:", error);
      setIsLoading(false);
    }
  };

  const handleClick = () => {
    if (isLoading) return;
    startRecording();
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="icon"
        onClick={handleClick}
        disabled={isLoading || !currentStation}
        className="relative"
      >
        <Music2 className="h-4 w-4" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </Button>

      {result && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg bg-card p-2 shadow-lg">
          <div className="space-y-1">
            <p className="text-xs font-semibold">{result.title}</p>
            <p className="text-xs text-muted-foreground">{result.artist}</p>
            <p className="text-xs text-muted-foreground">{result.album}</p>
            <div className="mt-2 flex space-x-2">
              {result.spotify.url && (
                <a
                  href={result.spotify.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Spotify
                </a>
              )}
              {result.apple_music.url && (
                <a
                  href={result.apple_music.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Apple Music
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
