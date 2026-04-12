// src/lib/workerManager.ts
// Promise-based wrapper for web workers with progress callbacks

type WorkerJob = {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  onProgress?: (pct: number) => void;
};

export class WorkerManager {
  private worker: Worker | null = null;
  private jobs = new Map<string, WorkerJob>();
  private counter = 0;

  constructor(private url: string | URL, private name: string) {}

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(this.url, { type: 'module', name: this.name });
      this.worker.onmessage = (e: MessageEvent) => {
        const { id, type, ...rest } = e.data;
        const job = this.jobs.get(id);
        if (!job) return;

        if (type === 'progress') {
          job.onProgress?.(rest.progress);
        } else if (type === 'result' || type === 'ready' || type === 'terminated') {
          this.jobs.delete(id);
          job.resolve(rest.data ?? rest);
        } else if (type === 'error') {
          this.jobs.delete(id);
          job.reject(new Error(rest.message));
        }
      };
      this.worker.onerror = (e) => {
        for (const [, job] of this.jobs) job.reject(new Error(e.message));
        this.jobs.clear();
      };
    }
    return this.worker;
  }

  send<T = any>(
    type: string,
    payload?: any,
    onProgress?: (pct: number) => void,
    transfer?: Transferable[]
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = `${this.name}-${++this.counter}`;
      this.jobs.set(id, { resolve, reject, onProgress });
      const w = this.ensureWorker();
      const msg = { id, type, payload };
      if (transfer?.length) {
        w.postMessage(msg, transfer);
      } else {
        w.postMessage(msg);
      }
    });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    for (const [, job] of this.jobs) job.reject(new Error('Worker terminated'));
    this.jobs.clear();
  }
}

// Singleton worker instances — created once, reused across the session
let _ffmpegWorker: WorkerManager | null = null;
let _imageMagickWorker: WorkerManager | null = null;

export function getFfmpegWorker(): WorkerManager {
  if (!_ffmpegWorker) {
    _ffmpegWorker = new WorkerManager(
      new URL('./workers/ffmpeg.worker.ts', import.meta.url),
      'ffmpeg'
    );
  }
  return _ffmpegWorker;
}

export function getImageMagickWorker(): WorkerManager {
  if (!_imageMagickWorker) {
    _imageMagickWorker = new WorkerManager(
      new URL('./workers/imagemagick.worker.ts', import.meta.url),
      'imagemagick'
    );
  }
  return _imageMagickWorker;
}
