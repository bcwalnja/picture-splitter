import JSZip from "jszip";
import "./styles.css";

const LETTER = { width: 8.5, height: 11 };
const DPI_OPTIONS = { print: 300, ratio: 100 };
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
};

const state = {
  file: null,
  image: null,
  objectUrl: null,
};

function getSettings() {
  const [columns, rows] = document.querySelector('input[name="grid"]:checked').value
    .split("x")
    .map(Number);
  const orientation = document.querySelector('input[name="orientation"]:checked').value;
  const quality = document.querySelector('input[name="quality"]:checked').value;
  const page = orientation === "portrait"
    ? LETTER
    : { width: LETTER.height, height: LETTER.width };

  return {
    columns,
    rows,
    orientation,
    dpi: DPI_OPTIONS[quality === "300" ? "print" : "ratio"],
    page,
    pageCount: columns * rows,
  };
}

function getFit(imageWidth, imageHeight, settings) {
  const canvasWidth = settings.columns * settings.page.width;
  const canvasHeight = settings.rows * settings.page.height;
  const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);

  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
  };
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
  elements.fileInput.value = "";
  elements.imageSummary.hidden = true;
  elements.dropZone.hidden = false;
  elements.downloadButton.disabled = true;
  elements.previewCanvas.hidden = true;
  elements.emptyPreview.hidden = false;
  setStatus("");
}

function loadImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Choose a supported image file to continue.", true);
    return;
  }

  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    state.file = file;
    state.image = image;
    state.objectUrl = objectUrl;
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
  const canvasWidth = settings.columns * settings.page.width;
  const canvasHeight = settings.rows * settings.page.height;
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

  for (let row = 0; row < settings.rows; row += 1) {
    for (let column = 0; column < settings.columns; column += 1) {
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
  elements.previewTitle.textContent = `${settings.columns} × ${settings.rows} pages`;
  elements.previewPageCount.textContent =
    `${settings.pageCount} ${settings.pageCount === 1 ? "page" : "pages"}`;
  elements.downloadCount.textContent = `${settings.pageCount} PNGs · ZIP`;
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
  const ihdrEnd = 8 + 4 + view.getUint32(8) + 4;
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
  const settings = getSettings();
  const fit = getFit(state.image.naturalWidth, state.image.naturalHeight, settings);
  const zip = new JSZip();

  elements.downloadButton.disabled = true;
  elements.downloadButton.classList.add("working");
  setStatus("Preparing your pages…");

  try {
    for (let row = 0; row < settings.rows; row += 1) {
      for (let column = 0; column < settings.columns; column += 1) {
        const pageImage = await renderPage(settings, fit, column, row);
        const pageNumber = String(row * settings.columns + column + 1).padStart(2, "0");
        const filename = `page-${pageNumber}-row-${row + 1}-column-${column + 1}.png`;
        zip.file(filename, pageImage);
      }
    }

    const archive = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const dpiLabel = settings.dpi === 300 ? "300dpi" : "aspect-ratio";
    downloadBlob(archive, `picture-splitter-${settings.columns}x${settings.rows}-${dpiLabel}.zip`);
    setStatus("Your page set is ready.");
  } catch (error) {
    console.error("Could not create the page download.", error);
    setStatus("Could not create the download. Try a smaller image or another browser.", true);
  } finally {
    elements.downloadButton.disabled = false;
    elements.downloadButton.classList.remove("working");
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

document.querySelectorAll('input[name="grid"], input[name="orientation"], input[name="quality"]')
  .forEach((input) => input.addEventListener("change", updatePreview));

elements.downloadButton.addEventListener("click", createDownload);
window.addEventListener("resize", drawPreview);
