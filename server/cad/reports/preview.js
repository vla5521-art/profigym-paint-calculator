function pngMetadata(bytes) {
  const signature = '89504e470d0a1a0a';
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== signature) return null;
  return { mime: 'image/png', extension: '.png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegMetadata(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { mime: 'image/jpeg', extension: '.jpg', height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += length + 2;
  }
  return null;
}

export function validatePreview(bytes, { maxBytes, maxWidth, maxHeight }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes) {
    throw Object.assign(new Error(`Preview должен быть непустым файлом не более ${maxBytes} байт`), { code: 'INVALID_REPORT_PREVIEW' });
  }
  const metadata = pngMetadata(bytes) ?? jpegMetadata(bytes);
  if (!metadata || metadata.width < 1 || metadata.height < 1 || metadata.width > maxWidth || metadata.height > maxHeight) {
    throw Object.assign(new Error(`Поддерживаются PNG/JPEG до ${maxWidth}×${maxHeight}`), { code: 'INVALID_REPORT_PREVIEW' });
  }
  return { ...metadata, sizeBytes: bytes.length };
}
