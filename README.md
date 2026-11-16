# [Picture Splitter](https://bcwalnja.github.io/picture-splitter)

This is a poster print tool for splitting one picture across US Letter pages. Images are processed locally in the browser. The output is the number of requested pictures in png format, bundled in 1 zip file.

### Using the app

1. Choose or drop an image.
2. Select the number of pages, page orientation, and image scaling mode.
3. Download a ZIP containing one PNG per page.

The `Scale to fit poster` option scales the complete picture uniformly to fill the selected grid's limiting dimension, aligned to the top-left corner. It exports pages at 300 DPI.

The `Keep original size` option preserves the source pixels and DPI, leaving unused space to the right and bottom white. PNG, JPEG, and WebP DPI metadata is used when available; images without readable DPI metadata use 96 DPI. The app expands the selected grid as needed, up to 3 × 3 pages. Images that the original size exceeds 3 x 3 are not handled at this time. I might decide to change that in the future.

[Picture Splitter](https://bcwalnja.github.io/picture-splitter) is hosted via a GitHub page.
