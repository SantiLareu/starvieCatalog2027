import { useCallback, useEffect, useRef, useState } from "react";

type VideoPageProps = {
  src: string;
  visible: boolean;
  playbackAllowed?: boolean;
};

export function VideoPage({ src, visible, playbackAllowed = true }: VideoPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    // React fija muted como propiedad. StPageFlip clona el DOM en portrait:
    // necesita también el atributo para que la copia nazca silenciada.
    if (video) video.defaultMuted = true;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !visible || failed) return;
    video.muted = true;
    video.autoplay = playbackAllowed;
    if (playbackAllowed) void video.play().catch(() => undefined);
    else video.pause();
    return () => video.pause();
  }, [failed, playbackAllowed, ready, visible]);

  return (
    <div
      className="pdf-page video-page"
      data-virtual-page="collection-2027-video"
      data-video-visible={visible ? "true" : "false"}
      aria-label="Video de StarVie Collection 2027"
    >
      <div className={`video-placeholder${ready ? " is-hidden" : ""}`}>
        <span>STARVIE</span>
        <strong>COLLECTION 2027</strong>
        <small>VIDEO</small>
      </div>
      {visible && !failed ? (
        <video
          ref={attachVideo}
          className={`collection-video${ready ? " is-ready" : ""}`}
          src={src}
          autoPlay={playbackAllowed}
          muted
          loop
          playsInline
          preload="metadata"
          onCanPlay={() => setReady(true)}
          onError={() => {
            setReady(false);
            setFailed(true);
          }}
        />
      ) : null}
      <span className="page-edge" aria-hidden="true" />
    </div>
  );
}
