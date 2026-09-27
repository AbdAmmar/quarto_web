/**
 * Rendering for a single Quarto piece on a 2D canvas context.
 *
 * A piece is an int 0-15 whose bits encode its 4 attributes:
 *   bit 0: Tall (1) / Short (0)
 *   bit 1: Dark (1) / Light (0)
 *   bit 2: Round (1) / Square (0)
 *   bit 3: Hollow (1) / Solid (0)
 *
 * Each attribute gets its own independent visual channel:
 *   Tall/Short   -> overall size of the shape
 *   Dark/Light   -> fill color
 *   Round/Square -> outline shape (circle vs square)
 *   Hollow/Solid -> a punched hole through the middle, or no hole at all
 *
 * The hole is always a small circle with a dark stroke (like the hole
 * through a real physical Quarto piece), so it reads clearly no matter
 * what color the piece is or what it's sitting on -- unlike an
 * outline-only rendering, which can nearly vanish for light-colored
 * pieces on a light background.
 */

export function drawPiece(ctx, cx, cy, piece, cellSize, { scale = 1.0, bgColor, theme } = {}) {
  const tall = Boolean(piece & 1);
  const dark = Boolean(piece & 2);
  const roundShape = Boolean(piece & 4);
  const hollow = Boolean(piece & 8);
  const bg = bgColor || theme.bgPanel;

  const half = (tall ? cellSize * 0.34 : cellSize * 0.20) * scale;
  const fillColor = dark ? theme.pieceDark : theme.pieceLight;

  const drawShape = (x, y, r, fill, stroke, lineWidth) => {
    ctx.beginPath();
    if (roundShape) {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else {
      ctx.rect(x - r, y - r, r * 2, r * 2);
    }
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  };

  // Soft drop shadow for a touch of depth.
  const off = Math.max(2.0, half * 0.14);
  drawShape(cx + off, cy + off * 1.6, half, theme.pieceShadow, null, 0);

  // Piece body: always solidly filled, regardless of hollow/solid.
  drawShape(cx, cy, half, fillColor, theme.pieceOutline, 2);

  // Hollow pieces get a punched hole through the middle -- always a
  // circle, independent of the piece's own outer shape.
  if (hollow) {
    const holeR = half * 0.42;
    const ringWidth = Math.max(1.5, 2 * scale);
    ctx.beginPath();
    ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = theme.pieceOutline;
    ctx.lineWidth = ringWidth;
    ctx.stroke();
  }
}
