declare module 'unzipper' {
  import { Readable } from 'stream';

  interface ArchiveEntry {
    path: string;
    type: string;
    uncompressedSize?: number;
    vars?: { uncompressedSize?: number };
    buffer(): Promise<Buffer>;
    stream(): Readable;
    autodrain(): void;
  }

  interface ArchiveDirectory {
    files: ArchiveEntry[];
  }

  const unzipper: {
    Open: {
      file(archivePath: string): Promise<ArchiveDirectory>;
    };
    Parse(): NodeJS.ReadWriteStream;
  };

  export = unzipper;
}

declare module 'ffprobe-static' {
  const ffprobeStatic: { path: string } | string;
  export = ffprobeStatic;
}

declare module 'ffmpeg-static' {
  const ffmpegStatic: string | null;
  export = ffmpegStatic;
}
