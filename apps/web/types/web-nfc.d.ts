/**
 * Web NFC (https://w3c.github.io/web-nfc/). Not in lib.dom yet, and shipped
 * only by Chromium on Android — iOS exposes NFC to native apps only, so any
 * caller must feature-detect rather than assume these exist.
 */

interface NDEFMessageSource {
  records: NDEFRecordInit[];
}

interface NDEFRecordInit {
  recordType: string;
  mediaType?: string;
  id?: string;
  encoding?: string;
  lang?: string;
  data?: string | BufferSource;
}

interface NDEFRecord {
  readonly recordType: string;
  readonly mediaType: string | null;
  readonly id: string | null;
  readonly data: DataView | null;
  readonly encoding: string | null;
  readonly lang: string | null;
}

interface NDEFMessage {
  readonly records: readonly NDEFRecord[];
}

interface NDEFReadingEvent extends Event {
  /** The tag's hardware serial number, e.g. "04:1a:2b:3c". */
  readonly serialNumber: string;
  readonly message: NDEFMessage;
}

interface NDEFWriteOptions {
  overwrite?: boolean;
  signal?: AbortSignal;
}

interface NDEFScanOptions {
  signal?: AbortSignal;
}

declare class NDEFReader extends EventTarget {
  constructor();
  scan(options?: NDEFScanOptions): Promise<void>;
  write(message: string | BufferSource | NDEFMessageSource, options?: NDEFWriteOptions): Promise<void>;
  onreading: ((this: NDEFReader, ev: NDEFReadingEvent) => unknown) | null;
  onreadingerror: ((this: NDEFReader, ev: Event) => unknown) | null;
  addEventListener(
    type: 'reading',
    listener: (this: NDEFReader, ev: NDEFReadingEvent) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: 'readingerror',
    listener: (this: NDEFReader, ev: Event) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

interface Window {
  NDEFReader?: typeof NDEFReader;
}
