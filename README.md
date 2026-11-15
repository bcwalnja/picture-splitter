# Picture Splitter

A browser-based tool for splitting one picture across US Letter pages. Images are processed locally in your browser and are never uploaded.

## Run locally

Open `index.html` directly in a browser, or press F5 in VS Code to launch it with the configured Chrome debugger. The site has no build step or runtime dependencies.

## Using the app

1. Choose or drop an image.
2. Select the number of pages across and down, page orientation, and output quality.
3. Download a ZIP containing one PNG per page.

The picture is scaled uniformly to fit the complete page grid, aligned to its top-left corner, and never cropped. Any unused area to the right or bottom remains white.

The print-ready option exports pages at 300 DPI (2550 × 3300 pixels for portrait, or 3300 × 2550 for landscape) and embeds the corresponding resolution in each PNG. The aspect-ratio option exports at 100 pixels per inch and is intended for choosing the print size in your print dialog.

## GitHub Pages

Publish the repository root with GitHub Pages. The relative file paths also work when the site is hosted under a project path such as `https://username.github.io/picture-splitter/`.
