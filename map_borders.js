const { Jimp } = require('jimp');

async function main() {
  const image = await Jimp.read('assets/web_home.jpg');
  const w = image.width;
  const h = image.height;

  // Let's scan and print coordinates of white pixels (R>240, G>240, B>240) in detail
  // to understand the white borders of the cards.
  
  // Find top-left corners of cards:
  // A top-left corner is a place where a white horizontal line meets a white vertical line.
  
  console.log("Scanning for white border pixels...");
  
  // Let's print out white pixel density or coordinates at some key regions.
  // We can write a grid of white pixel check
  const grid = [];
  for (let y = 0; y < h; y += 10) {
    let row = '';
    for (let x = 0; x < w; x += 10) {
      const color = image.getPixelColor(x, y);
      const r = (color >> 24) & 0xff;
      const g = (color >> 16) & 0xff;
      const b = (color >> 8) & 0xff;
      if (r > 240 && g > 240 && b > 240) {
        row += '*';
      } else {
        row += ' ';
      }
    }
    if (row.trim().length > 0) {
      grid.push({ y, row });
    }
  }

  // Print a simplified map of white pixels
  console.log("White border map:");
  grid.forEach(g => {
    // Print only every 2nd row to save space
    if (g.y % 20 === 0) {
      console.log(`y=${String(g.y).padStart(4, '0')}: ${g.row}`);
    }
  });
}

main();
