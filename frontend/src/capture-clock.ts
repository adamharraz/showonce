type CaptureSession = { created_at: string; finished_at?: string | null };

// Analysis can continue after capture ends. Its latency is not recording time.
export function captureElapsedMs(
  session: CaptureSession | null,
  stoppedAt: number | null,
  now = Date.now(),
): number {
  if (!session) return 0;
  const end =
    stoppedAt ?? (session.finished_at ? Date.parse(session.finished_at) : now);
  return Math.max(0, end - Date.parse(session.created_at));
}
