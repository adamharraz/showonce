import { beforeEach, expect, test, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
vi.mock('./api', () => ({ getToken: () => 'test-only' }));
import { FullRecording, pendingRecordings, retryRecording } from './recording';

class Recorder {
  static instance: Recorder;
  static isTypeSupported() { return true; }
  state = 'inactive';
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  constructor() { Recorder.instance = this; }
  start() { this.state = 'recording'; }
  emit(text: string) { this.ondataavailable?.({ data: new Blob([text]) }); }
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => { this.emit('final audio and video'); this.onstop?.(); });
  }
}
const stream = { getAudioTracks: () => [{}], getTracks: () => [{ addEventListener() {} }] } as unknown as MediaStream;
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('MediaRecorder', Recorder);
});

test('Finish waits for final media chunk, verifies upload, and is safe when called twice', async () => {
  const calls: string[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    calls.push(url);
    if (url.endsWith('/complete')) expect(JSON.parse(init.body as string).count).toBe(2);
    return new Response('{}');
  });
  vi.stubGlobal('fetch', fetcher);
  const recording = await FullRecording.start('fixture', stream, 0, vi.fn());
  Recorder.instance.emit('initial media');
  recording.stopNow();
  await Promise.all([recording.finish(), recording.finish()]);
  expect(calls.filter(url => url.endsWith('/complete'))).toHaveLength(1);
  expect(calls.some(url => url.endsWith('/chunks/1'))).toBe(true);
  expect(await pendingRecordings()).toEqual([]);
});

test('failed uploads preserve the final chunk locally for retry without recording again', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(url.endsWith('/start') ? '{}' : '{"detail":"offline"}', { status: url.endsWith('/start') ? 200 : 503 })));
  const failure = vi.fn();
  const recording = await FullRecording.start('retry-fixture', stream, 0, failure);
  Recorder.instance.emit('initial media');
  await expect(recording.finish()).rejects.toThrow('offline');
  expect((await pendingRecordings())[0].count).toBe(2);
  const retried: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { retried.push(url); return new Response('{}'); }));
  await retryRecording('retry-fixture');
  expect(retried.filter(url => url.includes('/chunks/'))).toHaveLength(2);
  expect(await pendingRecordings()).toEqual([]);
});
