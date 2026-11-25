import { usePlayerStore } from "../stores/playerStore";
import "./PlaybackCube.css";

export function PlaybackCube() {
  const playingStation = usePlayerStore((state) =>
    state.isPlaying ? state.currentStation?.address : undefined,
  );

  return (
    <span className="wf-cube" aria-hidden="true">
      <span key={playingStation ?? "idle"} className="wf-cube-body" data-playing={Boolean(playingStation)}>
        <span className="wf-cube-front">[WF]</span>
        <span className="wf-cube-right">[WF]</span>
        <span className="wf-cube-back">[WF]</span>
        <span className="wf-cube-left">[WF]</span>
        <span className="wf-cube-top" />
        <span className="wf-cube-bottom" />
      </span>
      <span className="wf-cube-orbit" />
    </span>
  );
}
