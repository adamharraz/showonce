import { getToken } from './api';

type Meta = { key: string; session: string; mime: string; count: number; duration_ms: number; complete: boolean; created_ms: number };
type Saved = Meta | { key: string; blob: Blob };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('showonce-recordings', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('chunks', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Local recording storage is unavailable'));
  });
}
async function put(value: Saved) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('chunks', 'readwrite');
      tx.objectStore('chunks').put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new Error('Could not save recording locally; storage may be full'));
    });
  } finally { db.close(); }
}
async function saved(key: string): Promise<Saved | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction('chunks').objectStore('chunks').get(key);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}
export async function pendingRecordings(): Promise<Meta[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction('chunks').objectStore('chunks').getAll();
      r.onsuccess = () => {
        const records = r.result.filter((v: Saved) => 'session' in v) as Meta[];
        const expired = records.filter(v => v.created_ms < Date.now()-7*86400000);
        void Promise.all(expired.map(removeLocal)).then(() => resolve(records.filter(v => v.complete && !expired.includes(v))), reject);
      };
      r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}
async function removeLocal(meta: Meta) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('chunks', 'readwrite'); const store = tx.objectStore('chunks');
      for (let i=0;i<meta.count;i++) store.delete(`${meta.session}:${i}`);
      store.delete(meta.key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function request(session: string, path: string, body: BodyInit, captureToken?: string, json = false) {
  const response = await fetch(`/api/sessions/${session}/recording/${path}`, {
    method: 'POST', headers: {
      ...(captureToken ? { 'X-Capture-Token': captureToken } : { Authorization: `Bearer ${getToken()}` }),
      'Content-Type': json ? 'application/json' : 'application/octet-stream',
    }, body, signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Recording upload failed; local copy preserved');
  }
  return response.json();
}
export async function retryRecording(session: string, captureToken?: string) {
  const meta = await saved(`${session}:meta`) as Meta | undefined;
  if (!meta?.complete) throw new Error('No finished local recording is available');
  for (let i=0;i<meta.count;i++) {
    const chunk = await saved(`${session}:${i}`);
    if (!chunk || !('blob' in chunk)) throw new Error('A local recording chunk is missing');
    await request(session, `chunks/${i}`, chunk.blob, captureToken);
  }
  await request(session, 'complete', JSON.stringify({ count: meta.count, duration_ms: meta.duration_ms }), captureToken, true);
  await removeLocal(meta);
}

export class FullRecording {
  private recorder: MediaRecorder;
  private queue: Promise<void> = Promise.resolve();
  private count = 0;
  private started = 0;
  private stopped: Promise<void>;
  private ended!: () => void;
  private stopRequested = false;
  private finished = false;
  private finishing: Promise<void> | null = null;
  private failure = '';
  private meta: Meta;
  private duration = 0;
  private constructor(private session: string, stream: MediaStream, mime: string,
    private onFailure: (message: string) => void, private captureToken?: string) {
    this.recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2000000, audioBitsPerSecond: 64000 });
    this.meta = { key: `${session}:meta`, session, mime, count: 0, duration_ms: 0, complete: false, created_ms: Date.now() };
    this.stopped = new Promise(resolve => { this.ended = resolve; });
    this.recorder.ondataavailable = event => {
      if (!event.data.size) return;
      const sequence = this.count++;
      const capturedDuration = Math.round(performance.now()-this.started);
      this.queue = this.queue.then(async () => {
        await put({ key: `${session}:${sequence}`, blob: event.data });
        await put({ ...this.meta, count: sequence+1, duration_ms: capturedDuration });
        if (!this.failure) await request(session, `chunks/${sequence}`, event.data, captureToken);
      }).catch(error => {
        this.failure = (error as Error).message;
        this.onFailure(this.failure);
        this.stopNow();
      });
    };
    this.recorder.onstop = () => {
      this.duration ||= performance.now()-this.started;
      this.ended();
    };
    this.recorder.onerror = () => { this.failure = 'Video recorder failed'; onFailure(this.failure); this.stopNow(); };
    // Terminate if either expected media track disappears.
    stream.getTracks().forEach(track => track.addEventListener('ended', () => {
      if (!this.stopRequested) { onFailure('Camera or microphone ended; recording stopped'); this.stopNow(); }
    }));
  }
  static async start(session: string, stream: MediaStream, startMs: number, onFailure: (message: string) => void, captureToken?: string) {
    if (typeof MediaRecorder === 'undefined') throw new Error('This browser does not support full-session recording');
    const mime = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error('No supported video recording format');
    const recording = new FullRecording(session, stream, mime, onFailure, captureToken);
    await put(recording.meta);
    await request(session, 'start', JSON.stringify({ mime, audio: stream.getAudioTracks().length > 0, start_ms: Math.round(startMs) }), captureToken, true);
    recording.started = performance.now();
    recording.recorder.start(2000);
    return recording;
  }
  stopNow() {
    if (this.stopRequested) return;
    this.stopRequested = true;
    this.duration = performance.now()-this.started;
    if (this.recorder.state !== 'inactive') this.recorder.stop(); else this.ended();
  }
  async finish() {
    if (this.finished) return;
    if (!this.finishing) this.finishing = this.complete().finally(() => { this.finishing = null; });
    return this.finishing;
  }
  private async complete() {
    if (this.finished) return;
    this.stopNow();
    await this.stopped;
    await this.queue;
    this.meta = { ...this.meta, count: this.count, duration_ms: Math.round(this.duration), complete: true };
    await put(this.meta);
    await retryRecording(this.session, this.captureToken);
    this.finished = true;
  }
}
