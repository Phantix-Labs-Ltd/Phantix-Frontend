import React, { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web/build/player/lottie_light";

interface LottiePlayerProps {
  /** Inline Lottie JSON. */
  animationData?: unknown;
  /** URL path to a Lottie JSON (fetched at runtime, keeps bundle small). */
  src?: string;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  speed?: number;
  /** Segment in frames, e.g. [0, 120] — plays just that range. */
  segment?: [number, number];
  onComplete?: () => void;
}

/**
 * Minimal lottie-web wrapper used across the SecureGraph apps.
 * Renders a Lottie JSON animation into a container and cleans it up on unmount.
 * Pass either `animationData` (inline JSON) or `src` (runtime path).
 */
export default function LottiePlayer({
  animationData,
  src,
  className,
  loop = true,
  autoplay = true,
  speed = 1,
  segment,
  onComplete,
}: LottiePlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    // The player (~240 KB) is decorative, so it loads with the first animation
    // that mounts instead of riding in every application's first-paint bundle.
    // The light build has no After Effects expression engine, which runs
    // expressions through eval() — blocked by the apps' CSP (no unsafe-eval).
    void import("lottie-web/build/player/lottie_light").then(({ default: lottie }) => {
      if (cancelled) return;
      const anim = lottie.loadAnimation({
        container: el,
        renderer: "svg",
        loop,
        autoplay,
        animationData: src ? undefined : (animationData as any),
        path: src,
      });
      anim.setSpeed(speed);
      if (segment && typeof anim.playSegments === "function") {
        anim.playSegments(segment, true);
      }
      if (onComplete) {
        anim.addEventListener("complete", () => onComplete());
      }
      animRef.current = anim;
    });
    return () => {
      cancelled = true;
      animRef.current?.destroy();
      animRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
