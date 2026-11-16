# [Picture Splitter](https://bcwalnja.github.io/picture-splitter)

A browser-based tool for splitting one picture across US Letter pages. Images are processed locally in your browser and are never uploaded.

## Run locally

Open `index.html` directly in a browser, or press F5 in VS Code to launch it with the configured Chrome debugger. The site has no build step or runtime dependencies.

## Using the app

1. Choose or drop an image.
2. Select the number of pages across and down (1 × 2, 2 × 1, 2 × 2, 2 × 3, or 3 × 3), page orientation, and image scaling mode.
3. Download a ZIP containing one PNG per page.

The **Scale to fit poster** option scales the complete picture uniformly to fill the selected grid's limiting dimension, aligned to the top-left corner. It exports pages at 300 DPI.

The **Keep original size** option preserves the source pixels and DPI, leaving unused space to the right and bottom white. PNG, JPEG, and WebP DPI metadata is used when available; images without readable DPI metadata use 96 DPI. The app expands the selected grid as needed, up to 3 × 3 pages, and blocks downloads that would need more pages rather than cropping the image. All output pages have white backgrounds and include their DPI in the PNG metadata.

Use the **Dark mode** button in the header to switch the interface theme.

## GitHub Pages

Publish the repository root with GitHub Pages. The relative file paths also work when the site is hosted under a project path such as `https://username.github.io/picture-splitter/`.
