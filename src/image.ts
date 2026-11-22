// Prepares an attached screenshot for analysis: shrinks it on a canvas so the
// request stays small, and returns it as a data URL. Logic ported from the original app.

const MAX_IMAGE_DIMENSION = 3200;
const MAX_IMAGE_DATA_URL_LENGTH = 10_000_000;

function loadImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not be decoded.'));
    image.src = sourceUrl;
  });
}

export async function prepareImageForAnalysis(file: File): Promise<string> {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.95);
    if (webp.length <= MAX_IMAGE_DATA_URL_LENGTH) return webp;

    const jpeg = canvas.toDataURL('image/jpeg', 0.88);
    if (jpeg.length <= MAX_IMAGE_DATA_URL_LENGTH) return jpeg;

    // Still too large: shrink the canvas itself and try once more.
    const smallerScale = Math.sqrt(MAX_IMAGE_DATA_URL_LENGTH / jpeg.length);
    canvas.width = Math.max(1, Math.round(canvas.width * smallerScale));
    canvas.height = Math.max(1, Math.round(canvas.height * smallerScale));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const reducedJpeg = canvas.toDataURL('image/jpeg', 0.82);
    if (reducedJpeg.length > MAX_IMAGE_DATA_URL_LENGTH) {
      throw new Error('Image could not be reduced below the request limit.');
    }
    return reducedJpeg;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
