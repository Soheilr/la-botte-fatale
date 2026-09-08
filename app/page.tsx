'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Phase = 'intro' | 'playing' | 'hit' | 'entering' | 'done';
type Obstacle = { x: number; width: number; height: number; kind: 'barrel' | 'glass' | 'crate' | 'cork'; label: string };
type ModelContext = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: () => unknown }, options?: { signal?: AbortSignal }) => void | Promise<void> };

const WORLD_END = 3310;
const DOOR_X = 3090;
const SPEED = 154;
const GRAVITY = 720;
const JUMP_POWER = 340;
const PLAYER_SCALE = 1.27;
const OBSTACLES: Obstacle[] = [
  { x: 500, width: 36, height: 31, kind: 'barrel', label: 'botte rotolante' },
  { x: 1080, width: 44, height: 24, kind: 'glass', label: 'bottiglie rotte' },
  { x: 1660, width: 48, height: 37, kind: 'crate', label: 'cassetta d’uva' },
  { x: 2300, width: 53, height: 32, kind: 'cork', label: 'tappo gigante' },
];
const COLORS = { black: '#10070a', burgundy: '#65152c', red: '#941d3d', green: '#173c2b', lightGreen: '#346044', cream: '#f3dfb2', gold: '#d3a24d', brown: '#6c452f', lightBrown: '#aa7550', purple: '#b47ab0' };

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawBottle(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha;
  rect(ctx, x + 4 * scale, y, 5 * scale, 4 * scale, COLORS.black);
  rect(ctx, x + 3 * scale, y + 3 * scale, 7 * scale, 5 * scale, COLORS.black);
  rect(ctx, x, y + 7 * scale, 13 * scale, 22 * scale, COLORS.black);
  rect(ctx, x + 3 * scale, y + 9 * scale, 7 * scale, 17 * scale, COLORS.green);
  rect(ctx, x + 4 * scale, y + 1 * scale, 4 * scale, 7 * scale, COLORS.cream);
  rect(ctx, x + 2 * scale, y + 15 * scale, 9 * scale, 7 * scale, COLORS.cream);
  rect(ctx, x + 4 * scale, y + 17 * scale, 5 * scale, 3 * scale, COLORS.red);
  ctx.restore();
}

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const s = frame % 2 === 0 ? 5 : 3;
  rect(ctx, x - 1, y - s, 3, s * 2 + 1, COLORS.cream);
  rect(ctx, x - s, y - 1, s * 2 + 1, 3, COLORS.cream);
  rect(ctx, x, y, 1, 1, COLORS.gold);
}

function drawRunner(ctx: CanvasRenderingContext2D, x: number, ground: number, jumpY: number, frame: number, entering: boolean) {
  const baseHeight = 31;
  const y = ground - baseHeight * PLAYER_SCALE - jumpY;
  const step = jumpY > 2 ? 1 : frame % 2;
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(PLAYER_SCALE, PLAYER_SCALE);
  // Lina, the bottle-runner: red bottle-cap beret, long scarf, green apron and bottle badge.
  rect(ctx, -4 - step * 2, 10, 9, 4, COLORS.cream);
  rect(ctx, -8 - step * 3, 8, 8, 3, COLORS.red);
  rect(ctx, 3, 2, 15, 10, COLORS.black);
  rect(ctx, 0, 1, 17, 4, COLORS.burgundy);
  rect(ctx, 5, -1, 9, 3, COLORS.red);
  rect(ctx, 6, 5, 10, 8, COLORS.cream);
  rect(ctx, 14, 7, 3, 3, COLORS.black);
  rect(ctx, 4, 12, 14, 13, COLORS.black);
  rect(ctx, 7, 13, 8, 5, COLORS.cream);
  rect(ctx, 5, 18, 12, 8, COLORS.green);
  rect(ctx, 8, 19, 6, 5, COLORS.cream);
  rect(ctx, 10, 20, 2, 3, COLORS.red);
  rect(ctx, 0, 14 + step * 2, 5, 10, COLORS.cream);
  rect(ctx, 17, 14 + (1 - step) * 2, 5, 10, COLORS.cream);
  rect(ctx, 1, 13, 3, 8, COLORS.green);
  if (entering) {
    rect(ctx, 7, 25, 5, 6, COLORS.brown); rect(ctx, 13, 25, 5, 6, COLORS.brown);
  } else {
    rect(ctx, 4, 25 + step * 2, 7, 4, COLORS.brown); rect(ctx, 14, 25 + (1 - step) * 2, 7, 4, COLORS.brown);
  }
  ctx.restore();
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle, x: number, ground: number, t: number) {
  const y = ground - obstacle.height;
  if (obstacle.kind === 'barrel') {
    const bob = Math.floor(t * 7) % 2;
    rect(ctx, x + 4, y + bob, 28, 30, COLORS.black); rect(ctx, x + 1, y + 6 + bob, 34, 18, COLORS.black);
    rect(ctx, x + 5, y + 3 + bob, 26, 24, COLORS.brown); rect(ctx, x + 3, y + 8 + bob, 30, 4, COLORS.lightBrown);
    rect(ctx, x + 3, y + 20 + bob, 30, 4, COLORS.lightBrown); rect(ctx, x + 17, y + 4 + bob, 3, 23, COLORS.black);
  } else if (obstacle.kind === 'glass') {
    rect(ctx, x, ground - 4, 44, 4, COLORS.purple); rect(ctx, x + 3, y + 9, 4, 15, COLORS.black);
    rect(ctx, x + 7, y + 16, 10, 4, COLORS.cream); rect(ctx, x + 20, y + 2, 4, 22, COLORS.black);
    rect(ctx, x + 23, y + 14, 10, 5, COLORS.cream); rect(ctx, x + 36, y + 11, 4, 13, COLORS.black);
  } else if (obstacle.kind === 'crate') {
    rect(ctx, x, y, 48, 37, COLORS.black); rect(ctx, x + 4, y + 4, 40, 29, COLORS.brown);
    rect(ctx, x + 7, y + 7, 34, 5, COLORS.lightBrown); rect(ctx, x + 7, y + 25, 34, 5, COLORS.lightBrown);
    for (let i = 0; i < 4; i++) rect(ctx, x + 9 + i * 8, y + 14 + (i % 2) * 4, 6, 6, i % 2 ? COLORS.red : COLORS.purple);
  } else {
    rect(ctx, x + 4, y + 2, 45, 28, COLORS.black); rect(ctx, x, y + 8, 53, 16, COLORS.black);
    rect(ctx, x + 5, y + 5, 43, 22, COLORS.lightBrown); rect(ctx, x + 11, y + 5, 4, 22, COLORS.brown);
    rect(ctx, x + 36, y + 5, 4, 22, COLORS.brown); rect(ctx, x + 20, y + 12, 11, 6, COLORS.burgundy);
  }
}

function drawMilestone(ctx: CanvasRenderingContext2D, x: number, ground: number, label: string, kind: 'post' | 'wall') {
  if (kind === 'post') {
    rect(ctx, x + 8, ground - 48, 5, 48, COLORS.black); rect(ctx, x + 1, ground - 55, 73, 24, COLORS.black);
    rect(ctx, x + 5, ground - 51, 65, 16, COLORS.cream);
    ctx.fillStyle = COLORS.black; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.fillText(label, x + 37, ground - 40);
  } else {
    rect(ctx, x, ground - 96, 94, 24, COLORS.black); rect(ctx, x + 4, ground - 92, 86, 16, COLORS.burgundy);
    ctx.fillStyle = COLORS.cream; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.fillText(label, x + 47, ground - 81);
  }
}

function drawDoor(ctx: CanvasRenderingContext2D, x: number, ground: number, opening: number, t: number) {
  const w = 148; const h = 145; const y = ground - h;
  const pulse = Math.floor(t * 4) % 2;
  rect(ctx, x - 10, y + 20, w + 20, h - 20, COLORS.black);
  rect(ctx, x - 5, y + 25, w + 10, h - 25, COLORS.burgundy);
  rect(ctx, x, y, w, 47, COLORS.black); rect(ctx, x + 6, y + 6, w - 12, 35, pulse ? COLORS.cream : COLORS.gold);
  ctx.fillStyle = COLORS.black; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
  ctx.fillText('LA BOTTE FATALE', x + w / 2, y + 28);
  for (let i = 0; i < 10; i++) {
    const lit = (i + pulse) % 2 === 0; rect(ctx, x + 8 + i * 14, y + 45, 6, 6, lit ? COLORS.cream : COLORS.red);
  }
  rect(ctx, x + 21, y + 57, 106, 88, COLORS.black);
  rect(ctx, x + 27, y + 63, 94, 76, COLORS.gold);
  const panel = Math.max(0, 44 - Math.floor(opening * 44));
  rect(ctx, x + 27, y + 63, panel, 76, COLORS.green); rect(ctx, x + 77 + (44 - panel), y + 63, panel, 76, COLORS.green);
  rect(ctx, x + 72, y + 96, 4, 4, COLORS.cream);
  drawBottle(ctx, x - 2, y + 78, 1.3); drawBottle(ctx, x + w - 15, y + 78, 1.3);
  drawSparkle(ctx, x + 8, y + 17, pulse); drawSparkle(ctx, x + w - 9, y + 17, 1 - pulse);
  rect(ctx, x - 14, ground - 7, w + 28, 7, COLORS.lightBrown);
}

function drawInterior(ctx: CanvasRenderingContext2D, width: number, height: number, t: number) {
  rect(ctx, 0, 0, width, height, COLORS.black);
  rect(ctx, 0, 0, width, Math.round(height * .75), COLORS.burgundy);
  for (let y = 12; y < height * .75; y += 18) {
    for (let x = (Math.floor(y / 18) % 2) * -16; x < width; x += 32) {
      rect(ctx, x, y, 28, 3, '#7b2339');
    }
  }
  const shelfTop = Math.max(54, Math.round(height * .19));
  rect(ctx, 12, shelfTop, Math.round(width * .39), 13, COLORS.black);
  rect(ctx, 18, shelfTop + 6, Math.round(width * .37), 5, COLORS.lightBrown);
  rect(ctx, 12, shelfTop + 54, Math.round(width * .39), 12, COLORS.black);
  rect(ctx, 18, shelfTop + 58, Math.round(width * .37), 5, COLORS.lightBrown);
  for (let row = 0; row < 2; row++) for (let i = 0; i < Math.floor(width / 34); i++) {
    drawBottle(ctx, 24 + i * 18, shelfTop + 17 + row * 54, .55, .92);
  }
  const lampGlow = Math.floor(t * 3) % 2 ? COLORS.cream : COLORS.gold;
  for (const lx of [Math.round(width * .2), Math.round(width * .52), Math.round(width * .83)]) {
    rect(ctx, lx, 0, 4, 24, COLORS.black); rect(ctx, lx - 10, 22, 24, 7, COLORS.black);
    rect(ctx, lx - 15, 28, 34, 18, COLORS.black); rect(ctx, lx - 10, 31, 24, 11, lampGlow);
  }
  const counterY = Math.round(height * .7);
  rect(ctx, 0, counterY, width, 13, COLORS.black); rect(ctx, 0, counterY + 6, width, 7, COLORS.lightBrown);
  rect(ctx, Math.round(width * .28), counterY + 12, Math.round(width * .58), height - counterY, COLORS.brown);
  for (let x = Math.round(width * .3); x < width * .84; x += 28) rect(ctx, x, counterY + 24, 5, height - counterY - 24, COLORS.black);
  for (const sx of [Math.round(width * .12), Math.round(width * .9)]) {
    rect(ctx, sx - 13, counterY + 23, 30, 8, COLORS.black); rect(ctx, sx, counterY + 31, 5, 29, COLORS.black); rect(ctx, sx - 9, counterY + 58, 23, 5, COLORS.black);
  }
  rect(ctx, 0, height - 18, width, 18, COLORS.black);
  for (let x = -10; x < width; x += 32) rect(ctx, x, height - 15, 22, 4, COLORS.lightBrown);
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const worldXRef = useRef(0);
  const jumpYRef = useRef(0);
  const velocityRef = useRef(0);
  const phaseRef = useRef<Phase>('intro');
  const phaseTimeRef = useRef(0);
  const collectedRef = useRef(new Set<number>());
  const [phase, setPhase] = useState<Phase>('intro');
  const [bottles, setBottles] = useState(0);
  const [message, setMessage] = useState('');

  const setGamePhase = useCallback((next: Phase) => { phaseRef.current = next; phaseTimeRef.current = 0; setPhase(next); }, []);
  const startGame = useCallback(() => {
    worldXRef.current = 0; jumpYRef.current = 0; velocityRef.current = 0; collectedRef.current = new Set();
    setBottles(0); setMessage(''); setGamePhase('playing');
  }, [setGamePhase]);
  const jump = useCallback(() => {
    if (phaseRef.current === 'intro') { startGame(); return; }
    if (phaseRef.current === 'playing' && jumpYRef.current < 3) velocityRef.current = JUMP_POWER;
  }, [startGame]);

  useEffect(() => {
    const image = new Image(); image.src = '/wine-world.png'; image.onload = () => { imageRef.current = image; };
    const canvas = canvasRef.current; if (!canvas) return;
    const resize = () => { const box = canvas.getBoundingClientRect(); canvas.width = Math.max(320, Math.floor(box.width / 3)); canvas.height = Math.max(190, Math.floor(box.height / 3)); };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize(); return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.code === 'Space' || event.code === 'ArrowUp') { event.preventDefault(); jump(); } };
    window.addEventListener('keydown', onKeyDown, { passive: false }); return () => window.removeEventListener('keydown', onKeyDown);
  }, [jump]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext; if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({ name: 'start_wine_adventure', title: 'Inizia l’avventura', description: 'Avvia o riavvia il gioco visibile de La Botte Fatale.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => { startGame(); return { status: 'playing', bottles: 0 }; } }, { signal: lifecycle.signal });
      await context.registerTool({ name: 'jump_wine_adventure', title: 'Salta', description: 'Fa saltare Lina nel gioco visibile quando la partita è in corso.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => { jump(); return { status: phaseRef.current, bottles: collectedRef.current.size }; } }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined); return () => lifecycle.abort();
  }, [jump, startGame]);

  useEffect(() => {
    const render = (time: number) => {
      const canvas = canvasRef.current; const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) { rafRef.current = requestAnimationFrame(render); return; }
      const dt = Math.min((time - (lastRef.current || time)) / 1000, .034); lastRef.current = time; phaseTimeRef.current += dt;
      const ground = canvas.height - 35; const playerScreenX = Math.round(canvas.width * .2);
      if (phaseRef.current === 'playing') {
        worldXRef.current += SPEED * dt; velocityRef.current -= GRAVITY * dt;
        jumpYRef.current = Math.max(0, jumpYRef.current + velocityRef.current * dt); if (jumpYRef.current === 0) velocityRef.current = 0;
        for (let index = 0; index < OBSTACLES.length; index++) {
          const obstacle = OBSTACLES[index]; const overlap = worldXRef.current + 24 > obstacle.x && worldXRef.current - 5 < obstacle.x + obstacle.width;
          if (overlap && jumpYRef.current < obstacle.height - 5) { setMessage('BOTTE FATTA!  SI RIPARTE'); setGamePhase('hit'); break; }
          if (worldXRef.current > obstacle.x + obstacle.width + 18 && !collectedRef.current.has(index)) {
            collectedRef.current.add(index); setBottles(collectedRef.current.size); setMessage('+1 BOTTIGLIA'); window.setTimeout(() => setMessage(''), 820);
          }
        }
        if (worldXRef.current >= DOOR_X - 12) { worldXRef.current = DOOR_X - 12; setMessage('LA PORTA FATALE SI APRE'); setGamePhase('entering'); }
      } else if (phaseRef.current === 'hit' && phaseTimeRef.current > .68) startGame();
      else if (phaseRef.current === 'entering' && phaseTimeRef.current > 2.25) { setMessage(''); setGamePhase('done'); }

      ctx.imageSmoothingEnabled = false;
      if (phaseRef.current === 'done') {
        drawInterior(ctx, canvas.width, canvas.height, time / 1000);
      } else {
        rect(ctx, 0, 0, canvas.width, canvas.height, COLORS.black);
        const image = imageRef.current; const progress = Math.min(1, worldXRef.current / WORLD_END);
        if (image) {
          const sourceHeight = image.height; const sourceWidth = Math.min(image.width, sourceHeight * (canvas.width / canvas.height));
          const sourceX = Math.floor((image.width - sourceWidth) * progress); ctx.drawImage(image, sourceX, 0, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
        }
        rect(ctx, 0, ground, canvas.width, canvas.height - ground, COLORS.black); rect(ctx, 0, ground, canvas.width, 4, COLORS.cream);
        for (let x = -((Math.floor(worldXRef.current) * 2) % 24); x < canvas.width; x += 24) rect(ctx, x, ground + 9, 12, 3, COLORS.brown);
        const cameraX = worldXRef.current - playerScreenX;
        const signs = [{ x: 90, label: 'VIGNE STORTE', kind: 'post' as const }, { x: 820, label: 'PERIFERIA', kind: 'post' as const }, { x: 1490, label: 'VICOLO DEL VINO', kind: 'wall' as const }];
        signs.forEach((sign) => { const sx = sign.x - cameraX; if (sx > -110 && sx < canvas.width + 110) drawMilestone(ctx, sx, ground, sign.label, sign.kind); });
        OBSTACLES.forEach((obstacle, index) => {
          const screenX = obstacle.x - cameraX; if (screenX > -80 && screenX < canvas.width + 80) drawObstacle(ctx, obstacle, screenX, ground, time / 1000);
          if (!collectedRef.current.has(index)) {
            const bx = obstacle.x + obstacle.width + 58 - cameraX; if (bx > -40 && bx < canvas.width + 40) { const by = ground - 55 - Math.floor(Math.sin(time / 180) * 3); drawBottle(ctx, bx, by, .8); drawSparkle(ctx, bx + 7, by - 7, Math.floor(time / 240)); }
          }
        });
        const doorScreenX = DOOR_X - cameraX;
        if (doorScreenX < canvas.width + 180) drawDoor(ctx, doorScreenX, ground, phaseRef.current === 'entering' ? Math.min(1, phaseTimeRef.current / .9) : 0, time / 1000);
        const enteringShift = phaseRef.current === 'entering' ? Math.min(72, phaseTimeRef.current * 33) : 0;
        drawRunner(ctx, playerScreenX + enteringShift, ground, jumpYRef.current, Math.floor(time / 130), phaseRef.current === 'entering');
        if (phaseRef.current === 'hit') { ctx.globalAlpha = Math.floor(phaseTimeRef.current * 14) % 2 ? .72 : .18; rect(ctx, 0, 0, canvas.width, canvas.height, COLORS.cream); ctx.globalAlpha = 1; }
      }
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render); return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [setGamePhase, startGame]);

  const handleGamePointer = (event: React.PointerEvent<HTMLDivElement>) => { if (!(event.target as HTMLElement).closest('a, button')) jump(); };
  return (
    <main className={`game-shell phase-${phase}`}>
      <section className="game-screen" aria-label="La Botte Fatale, avventura pixel-art" onPointerDown={handleGamePointer}>
        <canvas ref={canvasRef} className="game-canvas" aria-label="Corri verso La Botte Fatale e salta gli ostacoli" />
        {phase !== 'done' && <header className="hud"><div className="hud-brand"><span>LA NOTTE DI LINA</span><strong>LA BOTTE FATALE</strong></div><div className="hud-bottles" aria-label={`${bottles} bottiglie raccolte su 4`}><span>LA CANTINETTA</span><div>{[0,1,2,3].map((index) => <i key={index} className={index < bottles ? 'full' : ''} />)}</div></div></header>}
        <div className={`game-message ${message ? 'visible' : ''}`} role="status" aria-live="polite">{message}</div>
        {phase === 'intro' && <div className="start-layer"><div className="title-lockup"><div className="title-rule"><i /> <span>UNA NOTTE · QUATTRO BOTTIGLIE</span> <i /></div><h1>LA BOTTE<br /><em>FATALE</em></h1><p>Porta Lina fino all’ultima luce della città.</p><button type="button" onClick={startGame}>STAPPA LA NOTTE <span>→</span></button><small>TAP · CLICK · SPAZIO PER SALTARE</small></div></div>}
        {phase === 'playing' && <div className="jump-prompt" aria-hidden="true">LINA SALTA <b>↑</b></div>}
        {phase === 'done' && <div className="final-layer"><div className="final-marquee"><p>LA PORTA ERA QUELLA GIUSTA</p><h2>LA BOTTE FATALE</h2><strong>Vino, bottiglie e incontri fatali.</strong></div><div className="bar-info"><div className="bar-note address"><span>DOVE TROVARCI</span><b>Via [indirizzo], [città]</b></div><div className="bar-note hours"><span>LUCI ACCESE</span><b>[giorni] · [orari]</b></div><a className="bar-note instagram" href="#" aria-label="Instagram, link da inserire"><span>ALLA RADIO</span><b>@[instagram]</b></a><a className="bar-note map" href="https://www.google.com/maps/search/?api=1&query=La+Botte+Fatale" target="_blank" rel="noreferrer"><span>SEGUI LA STRADA</span><b>GOOGLE MAPS ↗</b></a></div><div className="bar-actions"><a className="enter-button" href="https://www.google.com/maps/search/?api=1&query=La+Botte+Fatale" target="_blank" rel="noreferrer">ENTRA NELLA BOTTE <span>→</span></a><button className="replay" type="button" onClick={startGame}>↺ UN’ALTRA NOTTE</button></div></div>}
      </section>
    </main>
  );
}
