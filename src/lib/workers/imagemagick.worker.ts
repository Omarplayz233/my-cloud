// src/lib/workers/imagemagick.worker.ts

let ImageMagick: any = null
let MagickFormat: any = null

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data

  try {
    if (type === "init") {
      const { wasmUrl, moduleUrl } = payload

      const mod = await import(moduleUrl)

      await mod.initializeImageMagick(wasmUrl)

      ImageMagick = mod.ImageMagick
      MagickFormat = mod.MagickFormat

      self.postMessage({ id, type: "ready" })
    }

    else if (type === "convert") {
      if (!ImageMagick)
        throw new Error("ImageMagick not initialized")

      const { inputData, outputFormat, options } = payload

      let result: Uint8Array | null = null

      ImageMagick.read(inputData, (img: any) => {

        if (options?.resize)
          img.resize(options.resize.width, options.resize.height)

        if (options?.quality)
          img.quality = options.quality

        if (options?.rotate)
          img.rotate(options.rotate)

        if (options?.flip)
          img.flip()

        if (options?.flop)
          img.flop()

        if (options?.grayscale)
          img.grayscale()

        img.write(
          (data: Uint8Array) => {
            result = new Uint8Array(data)
          },
          MagickFormat[outputFormat] ?? MagickFormat.Png
        )
      })

      if (!result)
        throw new Error("ImageMagick produced no output")

      self.postMessage(
        { id, type: "result", data: result },
        [(result as Uint8Array).buffer]
      )
    }

    else if (type === "info") {
      if (!ImageMagick)
        throw new Error("ImageMagick not initialized")

      const { inputData } = payload

      let info: any = {}

      ImageMagick.read(inputData, (img: any) => {
        info = {
          width: img.width,
          height: img.height,
          format: img.format,
          depth: img.depth,
          colorSpace: img.colorSpace?.toString()
        }
      })

      self.postMessage({
        id,
        type: "result",
        data: info
      })
    }

  } catch (err: any) {
    self.postMessage({
      id,
      type: "error",
      message: err?.message ?? String(err)
    })
  }
}
