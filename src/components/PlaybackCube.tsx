import { useEffect, useRef } from "react";
import { usePlayerStore } from "../stores/playerStore";
import "./PlaybackCube.css";

export function PlaybackCube() {
  const body = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let turn: Animation | undefined;
    // Native yaw speeds are radians per second. Change the timeline rate to
    // keep the current face in place when playback starts or pauses.
    const idle = 0.52;
    const playing = 2.25;
    function sync() {
      if (motion.matches) {
        turn?.cancel();
        turn = undefined;
        return;
      }
      turn ??= element!.animate([
        { transform: "rotateZ(-6deg) rotateX(-21deg) rotateY(-33deg)" },
        { transform: "rotateZ(-6deg) rotateX(-21deg) rotateY(327deg)" },
      ], { duration: 1000 * 2 * Math.PI / idle, iterations: Infinity, easing: "linear" });
      turn.updatePlaybackRate(usePlayerStore.getState().isPlaying ? playing / idle : 1);
    }
    sync();
    motion.addEventListener("change", sync);
    const unsubscribe = usePlayerStore.subscribe((state, previous) => {
      if (state.isPlaying !== previous.isPlaying) sync();
    });
    return () => {
      unsubscribe();
      motion.removeEventListener("change", sync);
      turn?.cancel();
    };
  }, []);

  return (
    <span className="wf-cube" aria-hidden="true">
      <span ref={body} className="wf-cube-body">
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
