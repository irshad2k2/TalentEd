/**
 * Uploads a video straight to S3/MinIO:
 *   1. ask the API for a presigned PUT URL (API validates type and size)
 *   2. PUT the file to storage with XMLHttpRequest (fetch has no upload-progress events)
 *   3. tell the API it's done; the API verifies the object in storage. Step 3 is retried, because
 *      it is idempotent: a network blip there must not force re-uploading 2 GB.
 */
import { useRef, useState } from 'react';
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES } from '@talented/shared';
import { api, errorMessage } from '../lib/api';
import { formatBytes } from '../lib/format';
import { ProgressBar } from './ui';

function putWithProgress(url: string, file: File, onProgress: (pct: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Network error during upload'));
    signal.addEventListener('abort', () => {
      xhr.abort();
      reject(new Error('Upload cancelled'));
    });
    xhr.send(file);
  });
}

async function completeWithRetry(key: string, size: number, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await api.post('/api/uploads/complete', { key, size });
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 1000 * i)); // back off 1s, 2s
    }
  }
}

export function VideoUploader({ onUploaded }: { onUploaded: (key: string) => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);

  async function handleFile(file: File) {
    setError('');
    if (!ALLOWED_VIDEO_TYPES.includes(file.type as (typeof ALLOWED_VIDEO_TYPES)[number])) {
      return setError('Use an MP4, WebM or MOV file');
    }
    if (file.size > MAX_VIDEO_BYTES) return setError('Video must be 2 GB or smaller');

    controller.current = new AbortController();
    try {
      setStatus('Preparing upload');
      const { data } = await api.post<{ key: string; url: string }>('/api/uploads/presign', {
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });
      setStatus(`Uploading ${formatBytes(file.size)}`);
      setProgress(0);
      await putWithProgress(data.url, file, setProgress, controller.current.signal);
      setStatus('Verifying');
      await completeWithRetry(data.key, file.size);
      setStatus('Uploaded');
      onUploaded(data.key);
    } catch (err) {
      setError(errorMessage(err));
      setProgress(null);
      setStatus('');
    }
  }

  const uploading = progress !== null && status !== 'Uploaded';

  return (
    <div className="space-y-2">
      <input
        type="file"
        accept={ALLOWED_VIDEO_TYPES.join(',')}
        disabled={uploading}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700"
      />
      {progress !== null && (
        <div>
          <ProgressBar percent={progress} />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>
              {status} {status.startsWith('Uploading') && `· ${progress}%`}
            </span>
            {uploading && (
              <button type="button" className="text-red-600" onClick={() => controller.current?.abort()}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
