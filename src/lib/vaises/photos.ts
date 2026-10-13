// Built from public/home-photos/vaises-hero by `npm run photos:vaises`.
const OPTIMIZED_DIR = "/home-photos/vaises-hero/optimized";

export type VaisesPhoto =
  | "landing"
  | "misija"
  | "uzkandziai"
  | "renginiai"
  | "vestuves"
  | "komanda";

export function vaisesPhotoAvifUrl(photo: VaisesPhoto): string {
  return `${OPTIMIZED_DIR}/${photo}.avif`;
}

/**
 * CSS background-image value: the browser downloads the AVIF, or the JPEG if it can't decode
 * AVIF. A browser too old for image-set() type() (pre-2023) drops the value and shows the
 * panel's dark fallback colour, which keeps the light titles readable.
 */
export function vaisesPhotoBackground(photo: VaisesPhoto): string {
  return `image-set(url("${vaisesPhotoAvifUrl(photo)}") type("image/avif"), url("${OPTIMIZED_DIR}/${photo}.jpg") type("image/jpeg"))`;
}
