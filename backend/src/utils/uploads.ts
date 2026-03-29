export function buildUploadUrl(filename: string) {
  return `/uploads/${encodeURIComponent(filename)}`;
}
