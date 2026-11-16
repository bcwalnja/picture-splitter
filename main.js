const LETTER = { width: 8.5, height: 11 };
const DEFAULT_DPI = 96;
const MAX_PAGES_PER_SIDE = 3;
const elements = {
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#image-input"),
  imageSummary: document.querySelector("#image-summary"),
  imageName: document.querySelector("#image-name"),
  imageDimensions: document.querySelector("#image-dimensions"),
  removeImage: document.querySelector("#remove-image"),
  downloadButton: document.querySelector("#download-button"),
  downloadCount: document.querySelector("#download-count"),
  statusMessage: document.querySelector("#status-message"),
  previewCanvas: document.querySelector("#preview-canvas"),
  emptyPreview: document.querySelector("#empty-preview"),
  previewTitle: document.querySelector("#preview-title"),
  previewPageCount: document.querySelector("#preview-page-count"),
  fitNote: document.querySelector("#fit-note"),
  themeToggle: document.querySelector("#theme-toggle"),
};

const state = {
  file: null,
  image: null,
  objectUrl: null,
  dpi: DEFAULT_DPI,
};

function getSettings() {
  const [columns, rows] = document.querySelector('input[name="grid"]:checked').value
    .split("x")
    .map(Number);
  const orientation = document.querySelector('input[name="orientation"]:checked').value;
  const scaling = document.querySelector('input[name="scaling"]:checked').value;
  const page = orientation === "portrait"
    ? LETTER
    : { width: LETTER.height, height: LETTER.width };

  return {
    columns,
    rows,
    orientation,
    scaling,
    dpi: scaling === "fit" ? 300 : state.dpi,
    page,
  };
}

function getFit(imageWidth, imageHeight, settings) {
  if (settings.scaling === "fit") {
    const canvasWidth = settings.columns * settings.page.width;
    const canvasHeight = settings.rows * settings.page.height;
    const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);

    return {
      width: imageWidth * scale,
      height: imageHeight * scale,
      columns: settings.columns,
      rows: settings.rows,
      requiredColumns: settings.columns,
      requiredRows: settings.rows,
      exceedsMax: false,
    };
  }

  const requiredColumns = Math.max(
    1,
    Math.ceil(imageWidth / (settings.page.width * settings.dpi) - 1e-10),
  );
  const requiredRows = Math.max(
    1,
    Math.ceil(imageHeight / (settings.page.height * settings.dpi) - 1e-10),
  );

  return {
    width: imageWidth / settings.dpi,
    height: imageHeight / settings.dpi,
    columns: Math.min(
      MAX_PAGES_PER_SIDE,
      Math.max(settings.columns, requiredColumns),
    ),
    rows: Math.min(
      MAX_PAGES_PER_SIDE,
      Math.max(settings.rows, requiredRows),
    ),
    requiredColumns,
    requiredRows,
    exceedsMax: requiredColumns > MAX_PAGES_PER_SIDE || requiredRows > MAX_PAGES_PER_SIDE,
  };
}

function getTiffDpi(view, offset, length) {
  if (offset + 8 > view.byteLength || length < 8) return null;
  const byteOrder = view.getUint16(offset, false);
  const littleEndian = byteOrder === 0x4949;
  if (!littleEndian && byteOrder !== 0x4d4d) return null;
  if (view.getUint16(offset + 2, littleEndian) !== 42) return null;

  const directoryOffset = view.getUint32(offset + 4, littleEndian);
  const directory = offset + directoryOffset;
  if (directory + 2 > offset + length || directory + 2 > view.byteLength) return null;

  const entryCount = view.getUint16(directory, littleEndian);
  let xResolution = null;
  let yResolution = null;
  let resolutionUnit = 2;
  for (let index = 0; index < entryCount; index += 1) {
    const entry = directory + 2 + index * 12;
    if (entry + 12 > offset + length || entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, littleEndian);
    const type = view.getUint16(entry + 2, littleEndian);
    const count = view.getUint32(entry + 4, littleEndian);

    if (tag === 0x0128 && type === 3 && count >= 1) {
      resolutionUnit = view.getUint16(entry + 8, littleEndian);
      continue;
    }
    if ((tag !== 0x011a && tag !== 0x011b) || type !== 5 || count < 1) continue;

    const valueOffset = offset + view.getUint32(entry + 8, littleEndian);
    if (valueOffset + 8 > offset + length || valueOffset + 8 > view.byteLength) continue;
    const denominator = view.getUint32(valueOffset + 4, littleEndian);
    if (denominator === 0) continue;
    const resolution = view.getUint32(valueOffset, littleEndian) / denominator;
    if (tag === 0x011a) xResolution = resolution;
    else yResolution = resolution;
  }

  const resolution = xResolution && yResolution
    ? (xResolution + yResolution) / 2
    : xResolution || yResolution;
  if (!resolution) return null;
  if (resolutionUnit === 3) return resolution * 2.54;
  return resolutionUnit === 2 ? resolution : null;
}

function getImageDpi(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isPng = bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47;

  if (isPng) {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset, false);
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      const dataOffset = offset + 8;
      if (type === "pHYs" && length >= 9 && dataOffset + 9 <= bytes.length) {
        const unit = view.getUint8(dataOffset + 8);
        const xPixelsPerMeter = view.getUint32(dataOffset, false);
        const yPixelsPerMeter = view.getUint32(dataOffset + 4, false);
        if (unit === 1 && xPixelsPerMeter > 0 && yPixelsPerMeter > 0) {
          return ((xPixelsPerMeter + yPixelsPerMeter) / 2) * 0.0254;
        }
        return null;
      }
      if (type === "IDAT" || type === "IEND") break;
      offset += length + 12;
    }
    return null;
  }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) break;
      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;

      const segmentLength = view.getUint16(offset, false);
      const segmentStart = offset + 2;
      const segmentEnd = offset + segmentLength;
      if (segmentLength < 2 || segmentEnd > bytes.length) break;

      if (
        marker === 0xe0
        && segmentLength >= 14
        && bytes[segmentStart] === 0x4a
        && bytes[segmentStart + 1] === 0x46
        && bytes[segmentStart + 2] === 0x49
        && bytes[segmentStart + 3] === 0x46
        && bytes[segmentStart + 4] === 0
      ) {
        const units = view.getUint8(segmentStart + 7);
        const xDensity = view.getUint16(segmentStart + 8, false);
        const yDensity = view.getUint16(segmentStart + 10, false);
        if (xDensity > 0 && yDensity > 0) {
          const density = (xDensity + yDensity) / 2;
          if (units === 1) return density;
          if (units === 2) return density * 2.54;
        }
      }

      if (
        marker === 0xe1
        && segmentLength >= 8
        && bytes[segmentStart] === 0x45
        && bytes[segmentStart + 1] === 0x78
        && bytes[segmentStart + 2] === 0x69
        && bytes[segmentStart + 3] === 0x66
        && bytes[segmentStart + 4] === 0
        && bytes[segmentStart + 5] === 0
      ) {
        const dpi = getTiffDpi(view, segmentStart + 6, segmentLength - 8);
        if (dpi) return dpi;
      }
      offset = segmentEnd;
    }
  }

  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
      const length = view.getUint32(offset + 4, true);
      const dataOffset = offset + 8;
      if (dataOffset + length > bytes.length) break;
      if (type === "EXIF") {
        const exifOffset = bytes[dataOffset] === 0x45 ? dataOffset + 6 : dataOffset;
        const dpi = getTiffDpi(view, exifOffset, dataOffset + length - exifOffset);
        if (dpi) return dpi;
      }
      offset = dataOffset + length + (length % 2);
    }
  }

  return null;
}

function setStatus(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle("error", isError);
}

function clearImage() {
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.file = null;
  state.image = null;
  state.objectUrl = null;
  state.dpi = DEFAULT_DPI;
  elements.fileInput.value = "";
  elements.imageSummary.hidden = true;
  elements.dropZone.hidden = false;
  elements.downloadButton.disabled = true;
  elements.previewCanvas.hidden = true;
  elements.emptyPreview.hidden = false;
  updatePreview();
}

function loadImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Choose a supported image file to continue.", true);
    return;
  }

  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  state.objectUrl = objectUrl;

  image.onload = async () => {
    let dpi;
    try {
      dpi = getImageDpi(new Uint8Array(await file.arrayBuffer())) ?? DEFAULT_DPI;
    } catch (error) {
      console.error("Could not read the image resolution metadata.", error);
      URL.revokeObjectURL(objectUrl);
      if (state.objectUrl === objectUrl) state.objectUrl = null;
      setStatus("Could not read this image’s resolution metadata. Try another image.", true);
      return;
    }
    if (state.objectUrl !== objectUrl) return;

    state.file = file;
    state.image = image;
    state.dpi = dpi;
    elements.imageName.textContent = file.name;
    elements.imageDimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    elements.dropZone.hidden = true;
    elements.imageSummary.hidden = false;
    elements.downloadButton.disabled = false;
    setStatus("");
    updatePreview();
  };

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    if (state.objectUrl === objectUrl) state.objectUrl = null;
    setStatus("This image could not be opened. Try another file.", true);
  };

  image.src = objectUrl;
}

function drawPreview() {
  if (!state.image) return;
  const settings = getSettings();
  const fit = getFit(state.image.naturalWidth, state.image.naturalHeight, settings);
  const stage = elements.previewCanvas.parentElement;
  const maxWidth = Math.max(100, stage.clientWidth - 64);
  const maxHeight = Math.max(100, stage.clientHeight - 64);
  const canvasWidth = fit.columns * settings.page.width;
  const canvasHeight = fit.rows * settings.page.height;
  const previewScale = Math.min(maxWidth / canvasWidth, maxHeight / canvasHeight);
  const pixelRatio = window.devicePixelRatio || 1;
  const canvas = elements.previewCanvas;

  canvas.width = Math.round(canvasWidth * previewScale * pixelRatio);
  canvas.height = Math.round(canvasHeight * previewScale * pixelRatio);
  canvas.style.width = `${Math.round(canvasWidth * previewScale)}px`;
  canvas.style.height = `${Math.round(canvasHeight * previewScale)}px`;

  const context = canvas.getContext("2d");
  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = "#e9e8e2";
  context.fillRect(0, 0, canvas.width / pixelRatio, canvas.height / pixelRatio);

  for (let row = 0; row < fit.rows; row += 1) {
    for (let column = 0; column < fit.columns; column += 1) {
      const x = column * settings.page.width * previewScale;
      const y = row * settings.page.height * previewScale;
      const width = settings.page.width * previewScale;
      const height = settings.page.height * previewScale;
      context.fillStyle = "#fff";
      context.fillRect(x, y, width, height);
      context.strokeStyle = "#d5d4ce";
      context.lineWidth = 1;
      context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    }
  }

  context.save();
  context.beginPath();
  context.rect(0, 0, fit.width * previewScale, fit.height * previewScale);
  context.clip();
  context.drawImage(
    state.image,
    0,
    0,
    fit.width * previewScale,
    fit.height * previewScale,
  );
  context.restore();

  elements.previewCanvas.hidden = false;
  elements.emptyPreview.hidden = true;
}

function updatePreview() {
  const settings = getSettings();
  const fit = state.image
    ? getFit(state.image.naturalWidth, state.image.naturalHeight, settings)
    : {
      columns: settings.columns,
      rows: settings.rows,
      exceedsMax: false,
      requiredColumns: settings.columns,
      requiredRows: settings.rows,
    };
  const pageCount = fit.columns * fit.rows;
  elements.previewTitle.textContent = `${fit.columns} × ${fit.rows} pages`;
  elements.previewPageCount.textContent = `${pageCount} ${pageCount === 1 ? "page" : "pages"}`;
  elements.downloadCount.textContent = `${pageCount} PNGs · ZIP`;
  elements.downloadButton.disabled = !state.image || fit.exceedsMax;

  if (!state.image) {
    elements.fitNote.textContent = "The whole picture fits, aligned to the top left.";
  } else if (fit.exceedsMax) {
    elements.fitNote.textContent =
      `Native size needs ${fit.requiredColumns} × ${fit.requiredRows} pages. Maximum is 3 × 3.`;
    setStatus("Choose “Scale to fit poster” to download this image.", true);
  } else if (settings.scaling === "native") {
    elements.fitNote.textContent =
      `${state.dpi} DPI · original pixels preserved${pageCount > settings.columns * settings.rows ? " · extra pages added" : ""}.`;
    setStatus("");
  } else {
    elements.fitNote.textContent = "Scaled to fit the selected poster, aligned to the top left.";
    setStatus("");
  }

  drawPreview();
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const { name, data } of files) {
    const nameBytes = encoder.encode(name);
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + data.length;
  }

  const centralDirectory = new Blob(centralParts);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.size, true);
  endView.setUint32(16, localOffset, true);

  return new Blob([...localParts, ...centralParts, endRecord], {
    type: "application/zip",
  });
}

function createPngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

async function addDpiMetadata(blob, dpi) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const ihdrEnd = 8 + 4 + 4 + view.getUint32(8) + 4;
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const physicalDimensions = new Uint8Array(9);
  const physicalView = new DataView(physicalDimensions.buffer);
  physicalView.setUint32(0, pixelsPerMeter);
  physicalView.setUint32(4, pixelsPerMeter);
  physicalView.setUint8(8, 1);
  const chunk = createPngChunk("pHYs", physicalDimensions);

  return new Blob([bytes.subarray(0, ihdrEnd), chunk, bytes.subarray(ihdrEnd)], {
    type: "image/png",
  });
}

function renderPage(settings, fit, column, row) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(settings.page.width * settings.dpi);
  canvas.height = Math.round(settings.page.height * settings.dpi);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const imageWidth = fit.width * settings.dpi;
  const imageHeight = fit.height * settings.dpi;
  const offsetX = column * canvas.width;
  const offsetY = row * canvas.height;
  const drawLeft = Math.max(0, -offsetX);
  const drawTop = Math.max(0, -offsetY);
  const drawRight = Math.min(canvas.width, imageWidth - offsetX);
  const drawBottom = Math.min(canvas.height, imageHeight - offsetY);

  if (drawRight > drawLeft && drawBottom > drawTop) {
    context.drawImage(
      state.image,
      (drawLeft + offsetX) / imageWidth * state.image.naturalWidth,
      (drawTop + offsetY) / imageHeight * state.image.naturalHeight,
      (drawRight - drawLeft) / imageWidth * state.image.naturalWidth,
      (drawBottom - drawTop) / imageHeight * state.image.naturalHeight,
      drawLeft,
      drawTop,
      drawRight - drawLeft,
      drawBottom - drawTop,
    );
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("The browser could not create a page image."));
        return;
      }
      try {
        resolve(await addDpiMetadata(blob, settings.dpi));
      } catch (error) {
        reject(error);
      }
    }, "image/png");
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function createDownload() {
  if (!state.image) return;
  const settings = getSettings();
  const fit = getFit(state.image.naturalWidth, state.image.naturalHeight, settings);
  if (fit.exceedsMax) {
    setStatus(
      `Native size needs ${fit.requiredColumns} × ${fit.requiredRows} pages. Choose “Scale to fit poster” to continue.`,
      true,
    );
    return;
  }
  const files = [];

  elements.downloadButton.disabled = true;
  elements.downloadButton.classList.add("working");
  setStatus("Preparing your pages…");

  try {
    for (let row = 0; row < fit.rows; row += 1) {
      for (let column = 0; column < fit.columns; column += 1) {
        const pageImage = await renderPage(settings, fit, column, row);
        const pageNumber = String(row * fit.columns + column + 1).padStart(2, "0");
        const filename = `page-${pageNumber}-row-${row + 1}-column-${column + 1}.png`;
        files.push({
          name: filename,
          data: new Uint8Array(await pageImage.arrayBuffer()),
        });
      }
    }

    const archive = createZip(files);
    const dpiLabel = settings.scaling === "fit" ? "300dpi" : `native-${Math.round(settings.dpi)}dpi`;
    downloadBlob(archive, `picture-splitter-${fit.columns}x${fit.rows}-${dpiLabel}.zip`);
    setStatus("Your page set is ready.");
  } catch (error) {
    console.error("Could not create the page download.", error);
    setStatus("Could not create the download. Try a smaller image or another browser.", true);
  } finally {
    elements.downloadButton.classList.remove("working");
    const currentFit = state.image
      ? getFit(state.image.naturalWidth, state.image.naturalHeight, getSettings())
      : null;
    elements.downloadButton.disabled = !currentFit || currentFit.exceedsMax;
  }
}

elements.fileInput.addEventListener("change", (event) => {
  loadImage(event.target.files?.[0]);
});

elements.removeImage.addEventListener("click", clearImage);

elements.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropZone.classList.add("dragging");
});

elements.dropZone.addEventListener("dragleave", (event) => {
  if (!elements.dropZone.contains(event.relatedTarget)) {
    elements.dropZone.classList.remove("dragging");
  }
});

elements.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove("dragging");
  loadImage(event.dataTransfer.files[0]);
});

document.querySelectorAll('input[name="grid"], input[name="orientation"], input[name="scaling"]')
  .forEach((input) => input.addEventListener("change", updatePreview));

elements.downloadButton.addEventListener("click", createDownload);
const themePreference = window.matchMedia("(prefers-color-scheme: dark)");
let manuallySelectedTheme = false;

function setTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  elements.themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  elements.themeToggle.setAttribute("aria-pressed", String(isDark));
}

setTheme(themePreference.matches ? "dark" : "light");
themePreference.addEventListener("change", (event) => {
  if (!manuallySelectedTheme) setTheme(event.matches ? "dark" : "light");
});

elements.themeToggle.addEventListener("click", () => {
  manuallySelectedTheme = true;
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
window.addEventListener("resize", drawPreview);
