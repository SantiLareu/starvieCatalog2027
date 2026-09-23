const decoded = new Map<string, Promise<void>>();
export function decodeImage(src: string) {
  let pending = decoded.get(src);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.decode().then(resolve, reject);
      image.onerror = () => reject(new Error('No se pudo cargar la imagen'));
      image.src = src;
    }).catch((error: unknown) => { decoded.delete(src); throw error; });
    decoded.set(src, pending);
  }
  return pending;
}
