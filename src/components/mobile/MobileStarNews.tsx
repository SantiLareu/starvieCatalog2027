import { useCallback, useEffect, useRef, useState } from "react";
import { starNewsArticles, type StarNewsArticle } from "../../data/starNewsContent";
import { ProductImage, assetUrl } from "../ProductImage";
import { MobileCourtBackground } from "./MobileCourtBackground";

export function MobileStarNews({ visible, playbackAllowed = true, videoSrc, articles = starNewsArticles }: {
  visible: boolean; playbackAllowed?: boolean; videoSrc: string; articles?: readonly StarNewsArticle[];
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const article = articles[0];
  const media = article?.media;
  const frames = media?.kind === "gallery" ? media.images : media?.kind === "image" ? [media] : [];
  const frame = frames[imageIndex % Math.max(1, frames.length)];
  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (video) video.defaultMuted = true; // native portrait copies must stay muted
  }, []);
  useEffect(() => { setImageIndex(0); setFailed(false); setReady(false); }, [article?.id, media]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !visible || failed) return;
    video.muted = true;
    video.autoplay = playbackAllowed;
    if (playbackAllowed) void video.play().catch(() => undefined);
    else video.pause();
    return () => video.pause();
  }, [article?.id, failed, playbackAllowed, ready, visible]);
  const activateMedia = () => {
    const video = videoRef.current;
    if (video) { if (video.paused) void video.play().catch(() => undefined); else video.pause(); }
    else if (frames.length > 1) setImageIndex(index => (index + 1) % frames.length);
  };
  return <div className="pdf-page video-page mobile-star-news" data-virtual-page="collection-2027-video"
    data-news-media={media?.kind}
    data-video-visible={visible ? "true" : "false"} data-testid="mobile-star-news" aria-label="StarNews, novedades StarVie">
    <MobileCourtBackground variant="news" />
    <header className="mobile-star-news__heading"><span>STARVIE</span><h1>STAR<span>NEWS</span></h1><p>NOVEDADES / NEWS</p><i aria-hidden="true" /></header>
    {article ? <div className="mobile-star-news__content" inert={!visible || !playbackAllowed}>
      <div className="mobile-star-news__media" aria-label={article.title}>
        <span className="mobile-star-news__badge">{media?.kind === "video" ? "● VIDEO" : media?.kind === "gallery" ? "IMÁGENES" : "IMAGEN"}</span>
        {media?.kind === "video" && visible && !failed ? <video key={article.id} ref={attachVideo}
          className="collection-video is-ready" src={media.src || videoSrc}
          poster={media.poster ? assetUrl(media.poster) : undefined} muted autoPlay={playbackAllowed} loop playsInline preload="metadata"
          onCanPlay={() => setReady(true)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} /> : null}
        {visible && frame ? <ProductImage key={frame.src} source={frame.src} original={assetUrl(frame.src)} alt={frame.alt} decoding="async" /> : null}
        {failed ? <p className="mobile-star-news__fallback">El video no está disponible ahora.</p> : null}
        {media?.kind === "video" && !failed ? <button className={`mobile-star-news__play${playing ? " is-playing" : ""}`} type="button" onClick={activateMedia}
          aria-label={playing ? "Pausar video de StarNews" : "Reproducir video de StarNews"}>{playing ? "Ⅱ" : "▶"}</button> : null}
        {frames.length > 1 ? <nav className="mobile-star-news__gallery" aria-label="Imágenes de la noticia">
          <button type="button" aria-label="Imagen anterior" onClick={() => setImageIndex(index => (index - 1 + frames.length) % frames.length)}>‹</button>
          <span>{imageIndex % frames.length + 1} / {frames.length}</span>
          <button type="button" aria-label="Imagen siguiente" onClick={() => setImageIndex(index => (index + 1) % frames.length)}>›</button>
        </nav> : null}
      </div>
      <section className="mobile-star-news__story" aria-live={visible ? "polite" : "off"}>
        <span>{article.category}</span><h2>{article.title}</h2><p>{article.description}</p>
      </section>
    </div> : null}
    <span className="page-edge" aria-hidden="true" />
  </div>;
}
