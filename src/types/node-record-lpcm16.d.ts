declare module 'node-record-lpcm16' {
  interface RecorderOptions {
    sampleRate?: number;
    threshold?: number;
    verbose?: boolean;
    recordProgram?: string;
    device?: string;
    // allow other properties
    [key: string]: any;
  }

  interface Recorder {
    start: (options?: RecorderOptions) => NodeJS.ReadableStream;
    stop: () => void;
    // some versions export a Record instance as a function
    (options?: RecorderOptions): NodeJS.ReadableStream;
  }

  const recorder: Recorder;
  export default recorder;
}
