export type UploadPhaseStatus = 'uploading' | 'done' | 'error';
export interface UploadState {
  status: UploadPhaseStatus;
  progress?: number; // 0..100
  error?: string | null;
}

export type TranscodePhaseStatus = 'transcoding' | 'done' | 'error';
export interface TranscodeState {
  status: TranscodePhaseStatus;
  progress?: number; // 0..100
  error?: string | null;
}

export interface ParsedItem {
  id: string;
  kind: 'local' | 'server';
  file: File | null;
  serverPath: string | null;
  name: string;
  size: number;
  ext: string;
  sessionKey: string | null;
  view: string | null;
  valid: boolean;
  error: string | null;
  upload: UploadState | null;
  transcode: TranscodeState | null;
}
