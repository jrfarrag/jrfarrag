const fs = require('fs');
const path = require('path');

// Ensure assets directory exists
const assetsDir = path.join(__dirname, 'assets');
const techDir = path.join(assetsDir, 'technology');
fs.mkdirSync(techDir, { recursive: true });

// -------------------------------------------------------------
// 1. SIMPLE GIF89a ENCODER (Zero Dependencies)
// -------------------------------------------------------------
class SimpleGifEncoder {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.frames = [];
    this.delay = 8; // 8 = 80ms
    this.repeat = 0; // infinite loop
  }

  setDelay(ms) {
    this.delay = Math.max(2, Math.round(ms / 10));
  }

  addFrame(pixels, palette) {
    this.frames.push({ pixels, palette });
  }

  encode() {
    const buffers = [];
    buffers.push(Buffer.from('GIF89a', 'ascii'));

    const lsd = Buffer.alloc(7);
    lsd.writeUInt16LE(this.width, 0);
    lsd.writeUInt16LE(this.height, 2);
    lsd[4] = 0x70;
    lsd[5] = 0;
    lsd[6] = 0;
    buffers.push(lsd);

    if (this.repeat >= 0) {
      const netscape = Buffer.alloc(19);
      netscape[0] = 0x21;
      netscape[1] = 0xFF;
      netscape[2] = 11;
      netscape.write('NETSCAPE2.0', 3, 'ascii');
      netscape[14] = 3;
      netscape[15] = 1;
      netscape.writeUInt16LE(this.repeat, 16);
      netscape[18] = 0;
      buffers.push(netscape);
    }

    for (const frame of this.frames) {
      const gce = Buffer.alloc(8);
      gce[0] = 0x21;
      gce[1] = 0xF9;
      gce[2] = 4;
      gce[3] = 0x04;
      gce.writeUInt16LE(this.delay, 4);
      gce[6] = 0;
      gce[7] = 0;
      buffers.push(gce);

      const colorCount = frame.palette.length;
      let power = Math.max(1, Math.ceil(Math.log2(colorCount)));
      if (power > 8) power = 8;
      const paletteSize = 1 << power;

      const id = Buffer.alloc(10);
      id[0] = 0x2C;
      id.writeUInt16LE(0, 1);
      id.writeUInt16LE(0, 3);
      id.writeUInt16LE(this.width, 5);
      id.writeUInt16LE(this.height, 7);
      id[9] = 0x80 | (power - 1);
      buffers.push(id);

      const lct = Buffer.alloc(paletteSize * 3, 0);
      for (let i = 0; i < frame.palette.length; i++) {
        lct[i * 3] = frame.palette[i][0];
        lct[i * 3 + 1] = frame.palette[i][1];
        lct[i * 3 + 2] = frame.palette[i][2];
      }
      buffers.push(lct);

      const minCodeSize = Math.max(2, power);
      const lzwData = this.lzwCompress(minCodeSize, frame.pixels);
      buffers.push(Buffer.from([minCodeSize]));
      buffers.push(lzwData);
    }

    buffers.push(Buffer.from([0x3B]));
    return Buffer.concat(buffers);
  }

  lzwCompress(minCodeSize, pixels) {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = endCode + 1;
    const maxCode = (1 << 12);

    const dictionary = new Map();
    function resetDict() {
      dictionary.clear();
      for (let i = 0; i < clearCode; i++) {
        dictionary.set(String.fromCharCode(i), i);
      }
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
    }

    const outputBits = [];
    function writeCode(code, size) {
      for (let i = 0; i < size; i++) {
        outputBits.push((code >> i) & 1);
      }
    }

    writeCode(clearCode, codeSize);
    resetDict();

    let curPrefix = '';
    for (let i = 0; i < pixels.length; i++) {
      const c = String.fromCharCode(pixels[i]);
      const nextPrefix = curPrefix + c;
      if (dictionary.has(nextPrefix)) {
        curPrefix = nextPrefix;
      } else {
        writeCode(dictionary.get(curPrefix), codeSize);
        if (nextCode < maxCode) {
          dictionary.set(nextPrefix, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
        } else {
          writeCode(clearCode, codeSize);
          resetDict();
        }
        curPrefix = c;
      }
    }

    if (curPrefix !== '') {
      writeCode(dictionary.get(curPrefix), codeSize);
    }
    writeCode(endCode, codeSize);

    const bytes = [];
    for (let i = 0; i < outputBits.length; i += 8) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        if (i + bit < outputBits.length) {
          byte |= (outputBits[i + bit] << bit);
        }
      }
      bytes.push(byte);
    }

    const blocks = [];
    for (let i = 0; i < bytes.length; i += 254) {
      const chunk = bytes.slice(i, i + 254);
      blocks.push(Buffer.from([chunk.length, ...chunk]));
    }
    blocks.push(Buffer.from([0]));
    return Buffer.concat(blocks);
  }
}

// -------------------------------------------------------------
// 2. 5x7 FONT DEFINITIONS
// -------------------------------------------------------------
const FONT_5X7 = {
  'A': [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  'B': [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
  'C': [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
  'D': [0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C],
  'E': [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
  'F': [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
  'G': [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0E],
  'H': [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  'I': [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
  'J': [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
  'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
  'M': [0x11, 0x1B, 0x15, 0x11, 0x11, 0x11, 0x11],
  'N': [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  'O': [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  'P': [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
  'Q': [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D],
  'R': [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
  'S': [0x0E, 0x11, 0x10, 0x0E, 0x01, 0x11, 0x0E],
  'T': [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  'V': [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
  'W': [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0A],
  'X': [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
  'Y': [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04],
  'Z': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
  '0': [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
  '1': [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
  '2': [0x0E, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1F],
  '3': [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E],
  '4': [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
  '5': [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
  '6': [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E],
  '7': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
  '9': [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],
  ':': [0x00, 0x04, 0x00, 0x00, 0x00, 0x04, 0x00],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x06, 0x06],
  '-': [0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00],
  '>': [0x10, 0x08, 0x04, 0x02, 0x04, 0x08, 0x10],
  '|': [0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  '[': [0x0E, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0E],
  ']': [0x0E, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0E],
  '$': [0x04, 0x0F, 0x14, 0x0E, 0x05, 0x1E, 0x04],
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
};

// -------------------------------------------------------------
// 3. CANVAS BUFFER CLASS
// -------------------------------------------------------------
class PixelCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height);
  }

  clear(colorIdx) {
    this.pixels.fill(colorIdx);
  }

  setPixel(x, y, colorIdx) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.pixels[y * this.width + x] = colorIdx;
    }
  }

  drawRect(x, y, w, h, colorIdx) {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        this.setPixel(px, py, colorIdx);
      }
    }
  }

  strokeRect(x, y, w, h, colorIdx) {
    for (let px = x; px < x + w; px++) {
      this.setPixel(px, y, colorIdx);
      this.setPixel(px, y + h - 1, colorIdx);
    }
    for (let py = y; py < y + h; py++) {
      this.setPixel(x, py, colorIdx);
      this.setPixel(x + w - 1, py, colorIdx);
    }
  }

  drawLine(x0, y0, x1, y1, colorIdx) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;
    while (true) {
      this.setPixel(cx, cy, colorIdx);
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }

  drawCircle(cx, cy, r, colorIdx, fill = false) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d2 = x * x + y * y;
        if (fill) {
          if (d2 <= r * r) {
            this.setPixel(cx + x, cy + y, colorIdx);
          }
        } else {
          if (d2 <= r * r && d2 >= (r - 1.5) * (r - 1.5)) {
            this.setPixel(cx + x, cy + y, colorIdx);
          }
        }
      }
    }
  }

  drawText(text, startX, startY, colorIdx, scale = 1) {
    let cursorX = startX;
    const upper = text.toUpperCase();

    for (let i = 0; i < upper.length; i++) {
      const char = upper[i];
      const glyph = FONT_5X7[char] || FONT_5X7[' '];

      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) {
            if (scale === 1) {
              this.setPixel(cursorX + col, startY + row, colorIdx);
            } else {
              this.drawRect(cursorX + col * scale, startY + row * scale, scale, scale, colorIdx);
            }
          }
        }
      }
      cursorX += (5 + 1) * scale;
    }
  }
}

// -------------------------------------------------------------
// 4. GENERATE CINEMATIC HERO ANIMATION (hero-devops.gif)
// -------------------------------------------------------------
console.log('Generating assets/hero-devops.gif...');
const W = 960;
const H = 280;

const PALETTE = [
  [8, 11, 20],     // 0: Deep Dark Background (#080B14)
  [13, 19, 33],    // 1: Card Surface (#0D1321)
  [21, 30, 51],    // 2: Border / Line Inactive (#151E33)
  [30, 41, 59],    // 3: Grid line (#1E293B)
  [34, 211, 238],  // 4: Electric Cyan Bright (#22D3EE)
  [6, 182, 212],   // 5: Cyan Mid (#06B6D4)
  [59, 130, 246],  // 6: Technology Blue (#3B82F6)
  [29, 78, 216],   // 7: Blue Dark (#1D4ED8)
  [139, 92, 246],  // 8: Accent Violet (#8B5CF6)
  [109, 40, 217],  // 9: Violet Dark (#6D28D9)
  [16, 185, 129],  // 10: Production Green (#10B981)
  [5, 150, 105],   // 11: Green Dark (#059669)
  [230, 237, 247], // 12: Primary Text Bright (#E6EDF7)
  [148, 163, 184], // 13: Secondary Text (#94A3B8)
  [100, 116, 139], // 14: Muted Text (#64748B)
  [244, 63, 94]    // 15: Telemetry Highlight Red/Pink (#F43F5E)
];

const STAGES = [
  { name: 'NETWORK', sub: 'L2/L3' },
  { name: 'CODE', sub: 'SOURCE' },
  { name: 'GIT', sub: 'GITOPS' },
  { name: 'BUILD', sub: 'RUNNER' },
  { name: 'TEST', sub: 'SECOPS' },
  { name: 'CONTAINER', sub: 'DOCKER' },
  { name: 'DEPLOY', sub: 'AUTOMATE' },
  { name: 'PRODUCTION', sub: 'RELIABLE' }
];

const gif = new SimpleGifEncoder(W, H);
gif.setDelay(75); // ~75ms per frame = 13.3 fps
const totalFrames = 32;

for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
  const canvas = new PixelCanvas(W, H);
  canvas.clear(0); // Deep background

  // 1. Subtle Engineering Grid
  for (let x = 0; x < W; x += 32) {
    for (let y = 0; y < H; y += 32) {
      canvas.setPixel(x, y, 3);
    }
  }

  // 2. Circuit traces / decorative technical lines
  canvas.drawLine(40, 24, W - 40, 24, 2);
  canvas.drawLine(40, H - 24, W - 40, H - 24, 2);
  canvas.drawLine(40, 24, 40, H - 24, 2);
  canvas.drawLine(W - 40, 24, W - 40, H - 24, 2);

  // Corner brackets
  canvas.drawRect(38, 22, 6, 2, 4);
  canvas.drawRect(38, 22, 2, 6, 4);
  canvas.drawRect(W - 44, 22, 6, 2, 4);
  canvas.drawRect(W - 40, 22, 2, 6, 4);
  canvas.drawRect(38, H - 24, 6, 2, 4);
  canvas.drawRect(38, H - 28, 2, 6, 4);
  canvas.drawRect(W - 44, H - 24, 6, 2, 4);
  canvas.drawRect(W - 40, H - 28, 2, 6, 4);

  // 3. Top Header Bar
  canvas.drawText('SYS_ID // MOHAMED FARRAG', 54, 34, 12, 1);
  canvas.drawText('INFRASTRUCTURE ARCHITECTURE & DEVOPS', 54, 46, 14, 1);

  // Status Badge on top right
  const pulseCol = (frameIdx % 16 < 8) ? 10 : 11;
  canvas.drawCircle(W - 190, 42, 3, pulseCol, true);
  canvas.drawText('CLUSTER ACTIVE // 99.99%', W - 180, 39, 13, 1);

  // 4. Central Sub-Title / Concept
  const conceptText = 'FROM NETWORK TO PRODUCTION';
  const conceptX = Math.floor((W - conceptText.length * 6 * 2) / 2);
  canvas.drawText(conceptText, conceptX, 74, 4, 2);

  canvas.drawLine(conceptX - 40, 81, conceptX - 10, 81, 6);
  canvas.drawLine(conceptX + conceptText.length * 12 + 10, 81, conceptX + conceptText.length * 12 + 40, 81, 6);

  // 5. The Living Pipeline Nodes
  const pipelineY = 160;
  const startX = 75;
  const endX = W - 75;
  const nodeCount = STAGES.length;
  const spacing = (endX - startX) / (nodeCount - 1);

  // Draw main pipeline backbone wire
  canvas.drawLine(startX, pipelineY, endX, pipelineY, 2);
  canvas.drawLine(startX, pipelineY + 1, endX, pipelineY + 1, 1);

  // Calculate moving light packet
  // Progress loops 0 to 1 across totalFrames
  const progress = frameIdx / totalFrames;
  const packetX = Math.round(startX + progress * (endX - startX));

  // Glowing packet trail
  for (let t = 0; t < 24; t++) {
    const trailX = packetX - t;
    if (trailX >= startX && trailX <= endX) {
      const trailCol = t < 4 ? 4 : (t < 10 ? 5 : (t < 18 ? 6 : 7));
      canvas.setPixel(trailX, pipelineY, trailCol);
      canvas.setPixel(trailX, pipelineY - 1, trailCol);
      canvas.setPixel(trailX, pipelineY + 1, trailCol);
    }
  }

  // Draw each Stage Node
  for (let i = 0; i < nodeCount; i++) {
    const nodeX = Math.round(startX + i * spacing);
    const activeStage = Math.floor(progress * nodeCount);
    const isCurrent = (i === activeStage);
    const isPassed = (i < activeStage);

    // Node Box / Icon representation
    const boxW = 86;
    const boxH = 46;
    const boxX = nodeX - Math.floor(boxW / 2);
    const boxY = pipelineY - Math.floor(boxH / 2);

    // Box background
    canvas.drawRect(boxX, boxY, boxW, boxH, 1);

    // Border highlight
    let borderCol = 2;
    let textCol = 14;
    let nodeDotCol = 3;

    if (isCurrent) {
      borderCol = 4; // Electric cyan
      textCol = 12;  // Bright white
      nodeDotCol = 4;
      // Ambient glow corners
      canvas.drawRect(boxX - 1, boxY - 1, boxW + 2, boxH + 2, 5);
      canvas.drawRect(boxX, boxY, boxW, boxH, 1);
    } else if (isPassed) {
      borderCol = 6; // Tech blue
      textCol = 13;
      nodeDotCol = 10; // Success green
    }

    canvas.strokeRect(boxX, boxY, boxW, boxH, borderCol);

    // Node index & status dot
    canvas.drawCircle(boxX + 10, boxY + 10, 2, nodeDotCol, true);
    canvas.drawText(`0${i + 1}`, boxX + 18, boxY + 7, isCurrent ? 4 : 14, 1);

    // Stage Name
    const stage = STAGES[i];
    const textW = stage.name.length * 6;
    const nameX = Math.floor(boxX + (boxW - textW) / 2);
    canvas.drawText(stage.name, nameX, boxY + 20, isCurrent ? 12 : (isPassed ? 13 : 14), 1);

    // Subtitle
    const subW = stage.sub.length * 6;
    const subX = Math.floor(boxX + (boxW - subW) / 2);
    canvas.drawText(stage.sub, subX, boxY + 32, isCurrent ? 4 : 14, 1);

    // Node connector dot on pipeline wire
    canvas.drawCircle(nodeX, pipelineY, 3, isCurrent ? 4 : (isPassed ? 6 : 2), true);
  }

  // 6. Bottom Telemetry & Metrics Bar
  canvas.drawLine(54, H - 48, W - 54, H - 48, 2);

  const termCursor = (frameIdx % 8 < 4) ? '_' : ' ';
  canvas.drawText(`$ DEPLOY_PIPELINE --STATE=SYNCHRONIZED ${termCursor}`, 54, H - 38, 4, 1);

  // Telemetry specs on bottom right
  const latency = 12 + (frameIdx % 5);
  canvas.drawText(`RTT: ${latency}ms | HOSTS: 50+ | HARDENED: STRICT`, W - 320, H - 38, 14, 1);

  gif.addFrame(canvas.pixels, PALETTE);
}

const gifBuffer = gif.encode();
fs.writeFileSync(path.join(assetsDir, 'hero-devops.gif'), gifBuffer);
console.log(`hero-devops.gif generated! Size: ${(gifBuffer.length / 1024).toFixed(1)} KB`);

// -------------------------------------------------------------
// 5. GENERATE STATIC HERO FALLBACK (hero-static.svg)
// -------------------------------------------------------------
console.log('Generating assets/hero-static.svg...');
const heroSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 360" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#080B14"/>
      <stop offset="100%" stop-color="#0D1321"/>
    </linearGradient>
    <linearGradient id="cyanBlue" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#22D3EE"/>
      <stop offset="50%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#151E33" stroke-width="0.8" opacity="0.6"/>
      <circle cx="40" cy="40" r="1" fill="#22D3EE" opacity="0.3"/>
    </pattern>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="360" fill="url(#bgGrad)"/>
  <rect width="1200" height="360" fill="url(#grid)"/>

  <!-- Outer Tech Frame -->
  <rect x="25" y="25" width="1150" height="310" rx="8" fill="none" stroke="#1E293B" stroke-width="1.5"/>
  <path d="M 25 50 L 25 25 L 50 25 M 1175 50 L 1175 25 L 1150 25 M 25 310 L 25 335 L 50 335 M 1175 310 L 1175 335 L 1150 335" fill="none" stroke="#22D3EE" stroke-width="3"/>

  <!-- Header -->
  <text x="50" y="60" font-family="'JetBrains Mono', Consolas, monospace" font-size="13" font-weight="700" fill="#22D3EE" letter-spacing="2">SYS_ID // MOHAMED FARRAG ABD-ELHADY</text>
  <text x="50" y="78" font-family="'Inter', sans-serif" font-size="12" fill="#94A3B8">Systems Administration &amp; Infrastructure Engineer | DevOps</text>

  <!-- Status indicator -->
  <circle cx="1060" cy="62" r="5" fill="#10B981" filter="url(#glow)"/>
  <text x="1075" y="66" font-family="'JetBrains Mono', Consolas, monospace" font-size="12" font-weight="600" fill="#E6EDF7">INFRASTRUCTURE ACTIVE</text>

  <!-- Center Title -->
  <text x="600" y="125" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="28" font-weight="900" fill="url(#cyanBlue)" letter-spacing="4">FROM NETWORK TO PRODUCTION</text>
  <text x="600" y="148" text-anchor="middle" font-family="'Inter', sans-serif" font-size="13" fill="#94A3B8" letter-spacing="1">LIVING AUTOMATED INFRASTRUCTURE ECOSYSTEM</text>

  <!-- Pipeline Backbone -->
  <line x1="80" y1="215" x2="1120" y2="215" stroke="#1E293B" stroke-width="3"/>
  <line x1="80" y1="215" x2="980" y2="215" stroke="url(#cyanBlue)" stroke-width="3" filter="url(#glow)"/>

  <!-- 8 Stages -->
  <!-- 01 NETWORK -->
  <g transform="translate(80, 185)">
    <rect x="-45" y="0" width="90" height="60" rx="6" fill="#0D1321" stroke="#3B82F6" stroke-width="1.5"/>
    <circle cx="0" cy="30" r="4" fill="#22D3EE"/>
    <text x="0" y="-8" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#22D3EE" font-weight="bold">01</text>
    <text x="0" y="20" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="bold" fill="#E6EDF7">NETWORK</text>
    <text x="0" y="48" text-anchor="middle" font-family="'Inter', sans-serif" font-size="9" fill="#94A3B8">ROUTING</text>
  </g>

  <!-- 02 CODE -->
  <g transform="translate(228, 185)">
    <rect x="-45" y="0" width="90" height="60" rx="6" fill="#0D1321" stroke="#3B82F6" stroke-width="1.5"/>
    <circle cx="0" cy="30" r="4" fill="#22D3EE"/>
    <text x="0" y="-8" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#22D3EE" font-weight="bold">02</text>
    <text x="0" y="20" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="bold" fill="#E6EDF7">CODE</text>
    <text x="0" y="48" text-anchor="middle" font-family="'Inter', sans-serif" font-size="9" fill="#94A3B8">SOURCE</text>
  </g>

  <!-- 03 GIT -->
  <g transform="translate(376, 185)">
    <rect x="-45" y="0" width="90" height="60" rx="6" fill="#0D1321" stroke="#3B82F6" stroke-width="1.5"/>
    <circle cx="0" cy="30" r="4" fill="#22D3EE"/>
    <text x="0" y="-8" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#22D3EE" font-weight="bold">03</text>
    <text x="0" y="20" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="bold" fill="#E6EDF7">GIT</text>
    <text x="0" y="48" text-anchor="middle" font-family="'Inter', sans-serif" font-size="9" fill="#94A3B8">GITOPS</text>
  </g>

  <!-- 04 BUILD -->
  <g transform="translate(524, 185)">
    <rect x="-45" y="0" width="90" height="60" rx="6" fill="#0D1321" stroke="#3B82F6" stroke-width="1.5"/>
    <circle cx="0" cy="30" r="4" fill="#22D3EE"/>
    <text x="0" y="-8" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#22D3EE" font-weight="bold">04</text>
    <text x="0" y="20" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="bold" fill="#E6EDF7">BUILD</text>
    <text x="0" y="48" text-anchor="middle" font-family="'Inter', sans-serif" font-size="9" fill="#94A3B8">RUNNER</text>
  </g>

  <!-- 05 TEST -->
  <g transform="translate(672, 185)">
    <rect x="-45" y="0" width="90" height="60" rx="6" fill="#0D1321" stroke="#8B5CF6" stroke-width="1.5"/>
    <circle cx="0" cy="30" r="4" fill="#8B5CF6"/>
    <text x="0" y="-8" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#8B5CF6" font-weight="bold">05</text>
    <text x="0" y="20" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="bold" fill="#E6EDF7">TEST</text>
    <text x="0" y="48" text-anchor="middle" font-family="'Inter', sans-serif" font-size="9" fill="#94A3B8">SECOPS</text>
  </g>

  <!-- 06 CONTAINER -->
  <g transform="translate(820, 185)">
    <rect x="-45" y="0" width="90" height="60" rx="6" fill="#0D1321" stroke="#8B5CF6" stroke-width="1.5"/>
    <circle cx="0" cy="30" r="4" fill="#8B5CF6"/>
    <text x="0" y="-8" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#8B5CF6" font-weight="bold">06</text>
    <text x="0" y="20" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="bold" fill="#E6EDF7">CONTAINER</text>
    <text x="0" y="48" text-anchor="middle" font-family="'Inter', sans-serif" font-size="9" fill="#94A3B8">DOCKER</text>
  </g>

  <!-- 07 DEPLOY -->
  <g transform="translate(968, 185)">
    <rect x="-45" y="0" width="90" height="60" rx="6" fill="#0D1321" stroke="#22D3EE" stroke-width="2"/>
    <circle cx="0" cy="30" r="4" fill="#22D3EE" filter="url(#glow)"/>
    <text x="0" y="-8" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#22D3EE" font-weight="bold">07</text>
    <text x="0" y="20" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="bold" fill="#22D3EE">DEPLOY</text>
    <text x="0" y="48" text-anchor="middle" font-family="'Inter', sans-serif" font-size="9" fill="#E6EDF7">AUTOMATE</text>
  </g>

  <!-- 08 PRODUCTION -->
  <g transform="translate(1116, 185)">
    <rect x="-45" y="0" width="90" height="60" rx="6" fill="#0D1321" stroke="#10B981" stroke-width="2"/>
    <circle cx="0" cy="30" r="4" fill="#10B981" filter="url(#glow)"/>
    <text x="0" y="-8" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" fill="#10B981" font-weight="bold">08</text>
    <text x="0" y="20" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="bold" fill="#10B981">PROD</text>
    <text x="0" y="48" text-anchor="middle" font-family="'Inter', sans-serif" font-size="9" fill="#E6EDF7">RELIABLE</text>
  </g>

  <!-- Footer Telemetry -->
  <text x="50" y="310" font-family="'JetBrains Mono', Consolas, monospace" font-size="12" fill="#22D3EE">$ automated_lifecycle --status=healthy --uptime=99.99%</text>
  <text x="1150" y="310" text-anchor="end" font-family="'JetBrains Mono', Consolas, monospace" font-size="12" fill="#94A3B8">SECURITY HARDENED // HIGH AVAILABILITY</text>
</svg>`;
fs.writeFileSync(path.join(assetsDir, 'hero-static.svg'), heroSvg);

// -------------------------------------------------------------
// 6. GENERATE PROFESSIONAL JOURNEY ROADMAP (journey.svg)
// -------------------------------------------------------------
console.log('Generating assets/journey.svg...');
const journeySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 240" width="100%" height="100%">
  <defs>
    <linearGradient id="jGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#080B14"/>
      <stop offset="100%" stop-color="#0D1321"/>
    </linearGradient>
    <linearGradient id="wireGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#22D3EE"/>
      <stop offset="33%" stop-color="#3B82F6"/>
      <stop offset="66%" stop-color="#8B5CF6"/>
      <stop offset="100%" stop-color="#10B981"/>
    </linearGradient>
    <filter id="jGlow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <rect width="1000" height="240" rx="10" fill="url(#jGrad)" stroke="#1E293B" stroke-width="1.5"/>

  <!-- Header -->
  <text x="40" y="38" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="700" fill="#22D3EE" letter-spacing="2">TECHNICAL EVOLUTION TIMELINE</text>
  <text x="40" y="55" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">From deep networking fundamentals to cloud architecture and production operations</text>

  <!-- Connecting Pathway -->
  <path d="M 125 130 L 375 130 L 625 130 L 875 130" stroke="#151E33" stroke-width="6"/>
  <path d="M 125 130 L 875 130" stroke="url(#wireGrad)" stroke-width="3" filter="url(#jGlow)"/>

  <!-- Step 01 -->
  <g transform="translate(125, 130)">
    <circle cx="0" cy="0" r="24" fill="#0D1321" stroke="#22D3EE" stroke-width="2"/>
    <text x="0" y="5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="bold" fill="#22D3EE">01</text>
    <text x="0" y="-36" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="700" fill="#E6EDF7">NETWORKING</text>
    <text x="0" y="44" text-anchor="middle" font-family="'Inter', sans-serif" font-size="10" fill="#94A3B8">Routing &amp; Switching</text>
    <text x="0" y="58" text-anchor="middle" font-family="'Inter', sans-serif" font-size="9" fill="#64748B">Subnets, Firewalls, CCNA</text>
  </g>

  <!-- Step 02 -->
  <g transform="translate(375, 130)">
    <circle cx="0" cy="0" r="24" fill="#0D1321" stroke="#3B82F6" stroke-width="2"/>
    <text x="0" y="5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="bold" fill="#3B82F6">02</text>
    <text x="0" y="-36" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="700" fill="#E6EDF7">SYSADMIN</text>
    <text x="0" y="44" text-anchor="middle" font-family="'Inter', sans-serif" font-size="10" fill="#94A3B8">Linux &amp; Web Hosting</text>
    <text x="0" y="58" text-anchor="middle" font-family="'Inter', sans-serif" font-size="9" fill="#64748B">Server Hardening, Nginx</text>
  </g>

  <!-- Step 03 -->
  <g transform="translate(625, 130)">
    <circle cx="0" cy="0" r="24" fill="#0D1321" stroke="#8B5CF6" stroke-width="2"/>
    <text x="0" y="5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="bold" fill="#8B5CF6">03</text>
    <text x="0" y="-36" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="700" fill="#E6EDF7">INFRASTRUCTURE</text>
    <text x="0" y="44" text-anchor="middle" font-family="'Inter', sans-serif" font-size="10" fill="#94A3B8">Cloud &amp; Virtualization</text>
    <text x="0" y="58" text-anchor="middle" font-family="'Inter', sans-serif" font-size="9" fill="#64748B">AWS, Azure, IaC, High-Avail</text>
  </g>

  <!-- Step 04 -->
  <g transform="translate(875, 130)">
    <circle cx="0" cy="0" r="24" fill="#0D1321" stroke="#10B981" stroke-width="2"/>
    <text x="0" y="5" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="bold" fill="#10B981">04</text>
    <text x="0" y="-36" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="700" fill="#E6EDF7">DEVOPS &amp; GITOPS</text>
    <text x="0" y="44" text-anchor="middle" font-family="'Inter', sans-serif" font-size="10" fill="#94A3B8">Continuous Delivery</text>
    <text x="0" y="58" text-anchor="middle" font-family="'Inter', sans-serif" font-size="9" fill="#64748B">Kubernetes, CI/CD, Observability</text>
  </g>
</svg>`;
fs.writeFileSync(path.join(assetsDir, 'journey.svg'), journeySvg);

// -------------------------------------------------------------
// 7. GENERATE TERMINAL COMPONENT (terminal.svg)
// -------------------------------------------------------------
console.log('Generating assets/terminal.svg...');
const terminalSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 240" width="100%" height="100%">
  <defs>
    <linearGradient id="termGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#080B14"/>
      <stop offset="100%" stop-color="#0D1321"/>
    </linearGradient>
  </defs>

  <rect width="800" height="240" rx="8" fill="url(#termGrad)" stroke="#1E293B" stroke-width="1.5"/>

  <!-- Title bar -->
  <path d="M 0 8 Q 0 0 8 0 L 792 0 Q 800 0 800 8 L 800 34 L 0 34 Z" fill="#111827"/>
  <circle cx="20" cy="17" r="5" fill="#EF4444"/>
  <circle cx="36" cy="17" r="5" fill="#F59E0B"/>
  <circle cx="52" cy="17" r="5" fill="#10B981"/>
  <text x="400" y="21" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="11" fill="#94A3B8">farrag@ops-node-01: ~</text>

  <!-- Commands & Output -->
  <text x="25" y="65" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="700" fill="#22D3EE">$ whoami</text>
  <text x="25" y="85" font-family="'JetBrains Mono', monospace" font-size="12" fill="#E6EDF7">Mohamed Farrag Abd-Elhady [Systems Administration &amp; Infrastructure Engineer | DevOps]</text>

  <text x="25" y="120" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="700" fill="#22D3EE">$ mission</text>
  <text x="25" y="140" font-family="'JetBrains Mono', monospace" font-size="12" fill="#3B82F6">Build. Automate. Deploy. Scale. Secure.</text>

  <text x="25" y="175" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="700" fill="#22D3EE">$ status --fleet</text>
  <text x="25" y="195" font-family="'JetBrains Mono', monospace" font-size="12" fill="#10B981">✓ 50+ Production Systems Active | Automated Deployments | Zero Downtime</text>
</svg>`;
fs.writeFileSync(path.join(assetsDir, 'terminal.svg'), terminalSvg);

// -------------------------------------------------------------
// 8. GENERATE MINDSET COMPONENT (mindset.svg)
// -------------------------------------------------------------
console.log('Generating assets/mindset.svg...');
const mindsetSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 160" width="100%" height="100%">
  <defs>
    <linearGradient id="mGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#080B14"/>
      <stop offset="100%" stop-color="#0D1321"/>
    </linearGradient>
  </defs>

  <rect width="1000" height="160" rx="10" fill="url(#mGrad)" stroke="#1E293B" stroke-width="1.5"/>

  <text x="40" y="35" font-family="'JetBrains Mono', monospace" font-size="13" font-weight="700" fill="#22D3EE" letter-spacing="2">CORE ENGINEERING MINDSET</text>

  <g transform="translate(40, 60)">
    <!-- 1 -->
    <rect x="0" y="0" width="170" height="70" rx="6" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="15" cy="20" r="3" fill="#22D3EE"/>
    <text x="26" y="24" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="bold" fill="#E6EDF7">INFRASTRUCTURE</text>
    <text x="15" y="48" font-family="'Inter', sans-serif" font-size="10" fill="#94A3B8">Before Deployment</text>

    <!-- 2 -->
    <rect x="185" y="0" width="170" height="70" rx="6" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="200" cy="20" r="3" fill="#3B82F6"/>
    <text x="211" y="24" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="bold" fill="#E6EDF7">AUTOMATION</text>
    <text x="200" y="48" font-family="'Inter', sans-serif" font-size="10" fill="#94A3B8">Over Repetitive Tasks</text>

    <!-- 3 -->
    <rect x="370" y="0" width="170" height="70" rx="6" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="385" cy="20" r="3" fill="#8B5CF6"/>
    <text x="396" y="24" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="bold" fill="#E6EDF7">SECURITY</text>
    <text x="385" y="48" font-family="'Inter', sans-serif" font-size="10" fill="#94A3B8">By Design &amp; Hardening</text>

    <!-- 4 -->
    <rect x="555" y="0" width="170" height="70" rx="6" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="570" cy="20" r="3" fill="#10B981"/>
    <text x="581" y="24" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="bold" fill="#E6EDF7">RELIABILITY</text>
    <text x="570" y="48" font-family="'Inter', sans-serif" font-size="10" fill="#94A3B8">Through Monitoring</text>

    <!-- 5 -->
    <rect x="740" y="0" width="170" height="70" rx="6" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="755" cy="20" r="3" fill="#22D3EE"/>
    <text x="766" y="24" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="bold" fill="#E6EDF7">CONTINUOUS</text>
    <text x="755" y="48" font-family="'Inter', sans-serif" font-size="10" fill="#94A3B8">Improvement &amp; Scale</text>
  </g>
</svg>`;
fs.writeFileSync(path.join(assetsDir, 'mindset.svg'), mindsetSvg);

// -------------------------------------------------------------
// 9. GENERATE TECHNOLOGY ECOSYSTEM CARD (tech-stack.svg)
// -------------------------------------------------------------
console.log('Generating assets/tech-stack.svg...');
const techStackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 680" width="100%" height="100%">
  <defs>
    <linearGradient id="tGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#080B14"/>
      <stop offset="100%" stop-color="#0D1321"/>
    </linearGradient>
  </defs>

  <rect width="1000" height="680" rx="10" fill="url(#tGrad)" stroke="#1E293B" stroke-width="1.5"/>

  <!-- Title -->
  <text x="40" y="40" font-family="'JetBrains Mono', monospace" font-size="14" font-weight="700" fill="#22D3EE" letter-spacing="2">PRODUCTION TECHNOLOGY ECOSYSTEM</text>
  <text x="40" y="60" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Curated, battle-tested tools across infrastructure, cloud, automation, and security</text>

  <!-- 3x3 Grid of Categories -->

  <!-- Card 1: Cloud & Virtualization -->
  <g transform="translate(40, 85)">
    <rect width="290" height="170" rx="8" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="20" cy="24" r="4" fill="#22D3EE"/>
    <text x="32" y="28" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="bold" fill="#E6EDF7">CLOUD &amp; VIRTUALIZATION</text>
    <text x="20" y="55" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">AWS • Microsoft Azure • GCP</text>
    <text x="20" y="75" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">DigitalOcean • Contabo</text>
    <text x="20" y="95" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">VMware vSphere • KVM</text>
    <text x="20" y="135" font-family="'JetBrains Mono', monospace" font-size="9" fill="#22D3EE">[Multi-Cloud &amp; Hypervisors]</text>
  </g>

  <!-- Card 2: Containers & Orchestration -->
  <g transform="translate(355, 85)">
    <rect width="290" height="170" rx="8" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="20" cy="24" r="4" fill="#3B82F6"/>
    <text x="32" y="28" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="bold" fill="#E6EDF7">CONTAINERS &amp; ORCHESTRATION</text>
    <text x="20" y="55" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Kubernetes (K8s) • Helm</text>
    <text x="20" y="75" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Docker • Docker Compose</text>
    <text x="20" y="95" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Podman • Containerd</text>
    <text x="20" y="135" font-family="'JetBrains Mono', monospace" font-size="9" fill="#3B82F6">[Production Microservices]</text>
  </g>

  <!-- Card 3: CI/CD & GitOps -->
  <g transform="translate(670, 85)">
    <rect width="290" height="170" rx="8" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="20" cy="24" r="4" fill="#8B5CF6"/>
    <text x="32" y="28" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="bold" fill="#E6EDF7">CI/CD &amp; GITOPS</text>
    <text x="20" y="55" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">GitHub Actions • GitLab CI</text>
    <text x="20" y="75" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Jenkins • Argo CD</text>
    <text x="20" y="95" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Git Workflow • Automated Releases</text>
    <text x="20" y="135" font-family="'JetBrains Mono', monospace" font-size="9" fill="#8B5CF6">[Continuous Delivery]</text>
  </g>

  <!-- Card 4: IaC & Automation -->
  <g transform="translate(40, 275)">
    <rect width="290" height="170" rx="8" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="20" cy="24" r="4" fill="#10B981"/>
    <text x="32" y="28" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="bold" fill="#E6EDF7">IAC &amp; AUTOMATION</text>
    <text x="20" y="55" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Terraform (HCL)</text>
    <text x="20" y="75" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Ansible Playbooks</text>
    <text x="20" y="95" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Bash Scripting • Python Ops</text>
    <text x="20" y="135" font-family="'JetBrains Mono', monospace" font-size="9" fill="#10B981">[Declarative Infrastructure]</text>
  </g>

  <!-- Card 5: Monitoring & Observability -->
  <g transform="translate(355, 275)">
    <rect width="290" height="170" rx="8" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="20" cy="24" r="4" fill="#22D3EE"/>
    <text x="32" y="28" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="bold" fill="#E6EDF7">OBSERVABILITY &amp; METRICS</text>
    <text x="20" y="55" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Prometheus • Alertmanager</text>
    <text x="20" y="75" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Grafana Dashboards</text>
    <text x="20" y="95" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Node Exporter • Log Analysis</text>
    <text x="20" y="135" font-family="'JetBrains Mono', monospace" font-size="9" fill="#22D3EE">[Real-time Telemetry]</text>
  </g>

  <!-- Card 6: SysAdmin & Hosting -->
  <g transform="translate(670, 275)">
    <rect width="290" height="170" rx="8" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="20" cy="24" r="4" fill="#3B82F6"/>
    <text x="32" y="28" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="bold" fill="#E6EDF7">SYSADMIN &amp; HOSTING</text>
    <text x="20" y="55" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Ubuntu, Debian, RHEL, AlmaLinux</text>
    <text x="20" y="75" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Nginx • Apache • SSL/TLS</text>
    <text x="20" y="95" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">cPanel/WHM • aaPanel • Plesk</text>
    <text x="20" y="135" font-family="'JetBrains Mono', monospace" font-size="9" fill="#3B82F6">[Production Web Servers]</text>
  </g>

  <!-- Card 7: Networking & Security -->
  <g transform="translate(40, 465)">
    <rect width="290" height="170" rx="8" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="20" cy="24" r="4" fill="#8B5CF6"/>
    <text x="32" y="28" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="bold" fill="#E6EDF7">NETWORKING &amp; SECURITY</text>
    <text x="20" y="55" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">FortiGate • Sophos • CSF Firewall</text>
    <text x="20" y="75" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">SonarQube • Trivy • Imunify</text>
    <text x="20" y="95" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">KubeSec • OWASP Dependency-Check</text>
    <text x="20" y="135" font-family="'JetBrains Mono', monospace" font-size="9" fill="#8B5CF6">[Hardened Perimeter &amp; Scan]</text>
  </g>

  <!-- Card 8: Databases & Caching -->
  <g transform="translate(355, 465)">
    <rect width="290" height="170" rx="8" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="20" cy="24" r="4" fill="#10B981"/>
    <text x="32" y="28" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="bold" fill="#E6EDF7">DATABASES &amp; CACHING</text>
    <text x="20" y="55" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">PostgreSQL • MySQL • MariaDB</text>
    <text x="20" y="75" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Redis In-Memory Cache</text>
    <text x="20" y="95" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Replication • Tuning • Backups</text>
    <text x="20" y="135" font-family="'JetBrains Mono', monospace" font-size="9" fill="#10B981">[Data Integrity &amp; High IOPS]</text>
  </g>

  <!-- Card 9: Backup & Disaster Recovery -->
  <g transform="translate(670, 465)">
    <rect width="290" height="170" rx="8" fill="#0A0F1D" stroke="#1E293B"/>
    <circle cx="20" cy="24" r="4" fill="#22D3EE"/>
    <text x="32" y="28" font-family="'JetBrains Mono', monospace" font-size="12" font-weight="bold" fill="#E6EDF7">BACKUP &amp; RECOVERY</text>
    <text x="20" y="55" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Velero (Kubernetes State)</text>
    <text x="20" y="75" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">MinIO S3-Compatible Object Store</text>
    <text x="20" y="95" font-family="'Inter', sans-serif" font-size="11" fill="#94A3B8">Veeam Backup • Acronis Cyber</text>
    <text x="20" y="135" font-family="'JetBrains Mono', monospace" font-size="9" fill="#22D3EE">[RTO &amp; RPO Compliance]</text>
  </g>
</svg>`;
fs.writeFileSync(path.join(assetsDir, 'tech-stack.svg'), techStackSvg);

console.log('All custom vector visual assets generated successfully!');
