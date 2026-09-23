import { useEffect, useRef, useState } from "react";

type VideoPageProps = {
  src: string;
  visible: boolean;
};

export function VideoPage({ src, visible }: VideoPageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !visible || failed) return;
    void video.play().catch(() => undefined);
    return () => video.pause();
  }, [failed, ready, visible]);

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
          ref={videoRef}
          className={`collection-video${ready ? " is-ready" : ""}`}
          src={src}
          autoPlay
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
