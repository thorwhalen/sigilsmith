import makeBlockie from 'ethereum-blockies-base64';
// Output is a PNG data URL (pnglib, pure JS); wrapped in an SVG <image> for the shared pipeline.
export default (key) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><image width="8" height="8" style="image-rendering:pixelated" href="${makeBlockie(key)}"/></svg>`;
