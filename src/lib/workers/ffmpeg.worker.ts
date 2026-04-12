// src/lib/workers/ffmpeg.worker.ts
// Runs FFmpeg entirely off the main thread

import { FFmpeg } from '@ffmpeg/ffmpeg';

let ffmpeg: FFmpeg | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;

  try {
    if (type === 'init') {
      // payload: { coreUrl, wasmUrl }
      ffmpeg = new FFmpeg();

      ffmpeg.on('progress', ({ progress, time }) => {
        self.postMessage({ id, type: 'progress', progress: Math.round(progress * 100), time });
      });

      ffmpeg.on('log', ({ message }) => {
        self.postMessage({ id, type: 'log', message });
      });

      await ffmpeg.load({
        coreURL: payload.coreUrl,
        wasmURL: payload.wasmUrl,
      });

      self.postMessage({ id, type: 'ready' });

    } else if (type === 'convert') {
      if (!ffmpeg) throw new Error('FFmpeg not initialized');
      // payload: { inputName, inputData: Uint8Array, outputName, args: string[] }
      const { inputName, inputData, outputName, args } = payload;

      await ffmpeg.writeFile(inputName, inputData);
      await ffmpeg.exec(args);
      const output = await ffmpeg.readFile(outputName) as Uint8Array;
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

      // Transfer back zero-copy
      self.postMessage({ id, type: 'result', data: output }, [output.buffer]);

    } else if (type === 'terminate') {
      ffmpeg?.terminate();
      ffmpeg = null;
      self.postMessage({ id, type: 'terminated' });
    }

  } catch (err: any) {
    self.postMessage({ id, type: 'error', message: err.message ?? String(err) });
  }
};
