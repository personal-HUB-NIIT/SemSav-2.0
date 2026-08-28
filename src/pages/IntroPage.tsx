import { useRef, useEffect, useCallback } from 'react';

export default function IntroPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigated = useRef(false);
  const flashTriggered = useRef(false);

  const goToRole = useCallback(() => {
    if (navigated.current) return;
    navigated.current = true;
    // Use hard navigation to bypass any stale SW / router cache
    window.location.replace('/role');
  }, []);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) {
      goToRole();
      return;
    }

    // Failsafe: if nothing fires within 30s, force navigation
    const failsafe = setTimeout(goToRole, 30000);

    const tryPlay = () => {
      vid.play().catch(() => {
        // Autoplay blocked — still show video controls fallback, or just navigate
        // Give it 1s then go
        setTimeout(goToRole, 1000);
      });
    };

    const onLoaded = () => tryPlay();

    const onTime = () => {
      if (flashTriggered.current) return;
      const d = vid.duration;
      if (!d || Number.isNaN(d) || d === Infinity) return;
      if (vid.currentTime / d > 0.85) {
        flashTriggered.current = true;
        vid.pause();
        const flash = document.getElementById('flash-overlay');
        if (flash) {
          flash.style.transition = 'opacity 0.7s ease-in';
          flash.style.opacity = '1';
        }
        setTimeout(goToRole, 900);
      }
    };

    const onEnd = () => goToRole();

    const onError = () => goToRole();

    vid.addEventListener('loadedmetadata', onLoaded);
    vid.addEventListener('timeupdate', onTime);
    vid.addEventListener('ended', onEnd);
    vid.addEventListener('error', onError);

    // If metadata already loaded, play immediately
    if (vid.readyState >= 1) {
      tryPlay();
    }

    return () => {
      clearTimeout(failsafe);
      vid.removeEventListener('loadedmetadata', onLoaded);
      vid.removeEventListener('timeupdate', onTime);
      vid.removeEventListener('ended', onEnd);
      vid.removeEventListener('error', onError);
    };
  }, [goToRole]);

  return (
    <div className="fixed inset-0 z-[100] bg-black" onClick={goToRole}>
      <video
        ref={videoRef}
        src="/video2.mp4"
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
        preload="auto"
      />

      {/* White flash at end */}
      <div
        id="flash-overlay"
        className="absolute inset-0 bg-white opacity-0 pointer-events-none"
      />

      <button
        onClick={(e) => {
          e.stopPropagation();
          goToRole();
        }}
        className="absolute top-6 right-6 z-[110] px-4 py-2 text-sm font-medium text-white/50 hover:text-white border border-white/10 hover:border-white/30 rounded-full transition-all backdrop-blur-sm"
      >
        Skip
      </button>
    </div>
  );
}
