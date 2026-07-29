const textDecoder = new TextDecoder("utf-8");

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  return -1;
}

function parseCentralDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) throw new Error("ZIP_END_NOT_FOUND");

  const entryCount = readUint16(view, eocdOffset + 10);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  const entries = new Map<string, ZipEntry>();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, offset) !== 0x02014b50) throw new Error("ZIP_CENTRAL_DIRECTORY_INVALID");
    const compressionMethod = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const name = textDecoder.decode(bytes.subarray(offset + 46, offset + 46 + fileNameLength));

    entries.set(name, {
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const blobBytes = new Uint8Array(data.byteLength);
  blobBytes.set(data);
  const stream = new Blob([blobBytes.buffer])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class XlsxArchive {
  private readonly bytes: Uint8Array;
  private readonly entries: Map<string, ZipEntry>;

  private constructor(bytes: Uint8Array, entries: Map<string, ZipEntry>) {
    this.bytes = bytes;
    this.entries = entries;
  }

  public static async fromArrayBuffer(buffer: ArrayBuffer): Promise<XlsxArchive> {
    const bytes = new Uint8Array(buffer);
    return new XlsxArchive(bytes, parseCentralDirectory(bytes));
  }

  public has(path: string): boolean {
    return this.entries.has(path);
  }

  public async readText(path: string): Promise<string> {
    const entry = this.entries.get(path);
    if (!entry) throw new Error(`ZIP_ENTRY_NOT_FOUND:${path}`);

    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const offset = entry.localHeaderOffset;
    if (readUint32(view, offset) !== 0x04034b50) throw new Error("ZIP_LOCAL_HEADER_INVALID");
    const fileNameLength = readUint16(view, offset + 26);
    const extraLength = readUint16(view, offset + 28);
    const dataStart = offset + 30 + fileNameLength + extraLength;
    const compressed = this.bytes.subarray(dataStart, dataStart + entry.compressedSize);

    let output: Uint8Array;
    if (entry.compressionMethod === 0) {
      output = compressed;
    } else if (entry.compressionMethod === 8) {
      output = await inflateRaw(compressed);
    } else {
      throw new Error(`ZIP_COMPRESSION_UNSUPPORTED:${entry.compressionMethod}`);
    }

    if (entry.uncompressedSize > 0 && output.byteLength !== entry.uncompressedSize) {
      throw new Error("ZIP_UNCOMPRESSED_SIZE_MISMATCH");
    }
    return textDecoder.decode(output);
  }
}
