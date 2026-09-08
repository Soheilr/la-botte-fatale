'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Phase = 'intro' | 'playing' | 'hit' | 'entering' | 'done';
type Obstacle = { x: number; width: number; height: number; kind: 'barrel' | 'glass' | 'crate' | 'cork'; label: string };
type ModelContext = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: () => unknown }, options?: { signal?: AbortSignal }) => void | Promise<void> };

const WORLD_END = 3920;
const DOOR_X = 3670;
const SPEED = 150;
const GRAVITY = 720;
const JUMP_POWER = 330;
const OBSTACLES: Obstacle[] = [
  { x: 760, width: 34, height: 30, kind: 'barrel', label: 'botte rotolante' },
  { x: 1500, width: 42, height: 23, kind: 'glass', label: 'bottiglie rotte' },
  { x: 2260, width: 46, height: 36, kind: 'crate', label: 'cassetta d’uva' },
  { x: 3010, width: 51, height: 31, kind: 'cork', label: 'tappo gigante' },
];
const COLORS = { black: '#10070a', burgundy: '#65152c', red: '#941d3d', green: '#173c2b', cream: '#f3dfb2', brown: '#6c452f', lightBrown: '#aa7550', purple: '#b47ab0' };

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawRunner(ctx: CanvasRenderingContext2D, x: number, ground: number, jumpY: number, frame: number, entering: boolean) {
  const y = ground - 29 - jumpY;
  const step = jumpY > 2 ? 1 : frame % 2;
  rect(ctx, x + 4, y + 2, 13, 9, COLORS.black);
  rect(ctx, x + 2, y + 1, 13, 3, COLORS.burgundy);
  rect(ctx, x + 4, y, 8, 2, COLORS.red);
  rect(ctx, x + 6, y + 4, 9, 7, COLORS.cream);
  rect(ctx, x + 13, y + 6, 2, 2, COLORS.black);
  rect(ctx, x + 5, y + 11, 12, 12, COLORS.black);
  rect(ctx, x + 7, y + 12, 8, 4, COLORS.cream);
  rect(ctx, x + 6, y + 16, 10, 8, COLORS.green);
  rect(ctx, x + 2, y + 13 + step * 2, 4, 9, COLORS.cream);
  rect(ctx, x + 16, y + 13 + (1 - step) * 2, 4, 9, COLORS.cream);
  if (entering) {
    rect(ctx, x + 7, y + 23, 4, 6, COLORS.brown);
    rect(ctx, x + 12, y + 23, 4, 6, COLORS.brown);
  } else {
    rect(ctx, x + 4, y + 23 + step * 2, 6, 4, COLORS.brown);
    rect(ctx, x + 13, y + 23 + (1 - step) * 2, 6, 4, COLORS.brown);
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle, x: number, ground: number, t: number) {
  const y = ground - obstacle.height;
  if (obstacle.kind === 'barrel') {
    const bob = Math.floor(t * 7) % 2;
    rect(ctx, x + 4, y + bob, 26, 29, COLORS.black); rect(ctx, x + 1, y + 6 + bob, 32, 17, COLORS.black);
    rect(ctx, x + 5, y + 3 + bob, 24, 23, COLORS.brown); rect(ctx, x + 3, y + 8 + bob, 28, 4, COLORS.lightBrown);
    rect(ctx, x + 3, y + 19 + bob, 28, 4, COLORS.lightBrown); rect(ctx, x + 16, y + 4 + bob, 3, 22, COLORS.black);
  } else if (obstacle.kind === 'glass') {
    rect(ctx, x, ground - 4, 42, 4, COLORS.purple); rect(ctx, x + 3, y + 9, 4, 14, COLORS.black);
    rect(ctx, x + 7, y + 15, 9, 4, COLORS.cream); rect(ctx, x + 19, y + 2, 4, 21, COLORS.black);
    rect(ctx, x + 22, y + 13, 10, 5, COLORS.cream); rect(ctx, x + 34, y + 11, 4, 12, COLORS.black);
  } else if (obstacle.kind === 'crate') {
    rect(ctx, x, y, 46, 36, COLORS.black); rect(ctx, x + 4, y + 4, 38, 28, COLORS.brown);
    rect(ctx, x + 7, y + 7, 32, 5, COLORS.lightBrown); rect(ctx, x + 7, y + 24, 32, 5, COLORS.lightBrown);
    for (let i = 0; i < 4; i++) rect(ctx, x + 9 + i * 8, y + 14 + (i % 2) * 4, 6, 6, i % 2 ? COLORS.red : COLORS.purple);
  } else {
    rect(ctx, x + 4, y + 2, 43, 27, COLORS.black); rect(ctx, x, y + 8, 51, 15, COLORS.black);
    rect(ctx, x + 5, y + 5, 41, 21, COLORS.lightBrown); rect(ctx, x + 11, y + 5, 4, 21, COLORS.brown);
    rect(ctx, x + 34, y + 5, 4, 21, COLORS.brown); rect(ctx, x + 19, y + 12, 10, 5, COLORS.burgundy);
  }
}

function drawDoor(ctx: CanvasRenderingContext2D, x: number, ground: number, opening: number) {
  const w = 100; const h = 104; const y = ground - h;
  rect(ctx, x, y, w, h, COLORS.black); rect(ctx, x + 5, y + 5, w - 10, h - 5, COLORS.burgundy);
  rect(ctx, x + 11, y + 11, w - 22, 28, COLORS.cream);
  ctx.fillStyle = COLORS.black; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
  ctx.fillText('LA BOTTE', x + w / 2, y + 23); ctx.fillText('FATALE', x + w / 2, y + 34);
  rect(ctx, x + 21, y + 47, 58, 57, COLORS.black);
  const panel = Math.max(0, 25 - Math.floor(opening * 25));
  rect(ctx, x + 25, y + 51, panel, 49, COLORS.green); rect(ctx, x + 50 + (25 - panel), y + 51, panel, 49, COLORS.green);
  rect(ctx, x + 48, y + 72, 4, 4, COLORS.cream); rect(ctx, x + 4, ground - 5, 92, 5, COLORS.lightBrown);
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
    setBottles(0); setMessage('VIA!'); setGamePhase('playing'); window.setTimeout(() => setMessage(''), 650);
  }, [setGamePhase]);
  const jump = useCallback(() => {
    if (phaseRef.current === 'intro') { startGame(); return; }
    if (phaseRef.current === 'done') return;
    if (phaseRef.current === 'playing' && jumpYRef.current < 3) {
      velocityRef.current = JUMP_POWER; setMessage('HOP!'); window.setTimeout(() => setMessage(''), 260);
    }
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
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({
        name: 'start_wine_adventure', title: 'Inizia l’avventura',
        description: 'Avvia o riavvia il gioco visibile de La Botte Fatale.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: () => { startGame(); return { status: 'playing', bottles: 0 }; },
      }, { signal: lifecycle.signal });
      await context.registerTool({
        name: 'jump_wine_adventure', title: 'Salta',
        description: 'Fa saltare il personaggio nel gioco visibile quando la partita è in corso.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: () => { jump(); return { status: phaseRef.current, bottles: collectedRef.current.size }; },
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [jump, startGame]);

  useEffect(() => {
    const render = (time: number) => {
      const canvas = canvasRef.current; const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) { rafRef.current = requestAnimationFrame(render); return; }
      const dt = Math.min((time - (lastRef.current || time)) / 1000, 0.034); lastRef.current = time; phaseTimeRef.current += dt;
      const ground = canvas.height - 35; const playerScreenX = Math.round(canvas.width * 0.21);
      if (phaseRef.current === 'playing') {
        worldXRef.current += SPEED * dt; velocityRef.current -= GRAVITY * dt;
        jumpYRef.current = Math.max(0, jumpYRef.current + velocityRef.current * dt); if (jumpYRef.current === 0) velocityRef.current = 0;
        for (let index = 0; index < OBSTACLES.length; index++) {
          const obstacle = OBSTACLES[index];
          const overlap = worldXRef.current + 17 > obstacle.x && worldXRef.current - 4 < obstacle.x + obstacle.width;
          if (overlap && jumpYRef.current < obstacle.height - 4) { setMessage('CRASH!  RIPARTI...'); setGamePhase('hit'); break; }
          if (worldXRef.current > obstacle.x + obstacle.width + 10 && !collectedRef.current.has(index)) {
            collectedRef.current.add(index); setBottles(collectedRef.current.size); setMessage('+1 BOTTIGLIA'); window.setTimeout(() => setMessage(''), 820);
          }
        }
        if (worldXRef.current >= DOOR_X - 8) { worldXRef.current = DOOR_X - 8; setMessage('SEI ARRIVATƏ!'); setGamePhase('entering'); }
      } else if (phaseRef.current === 'hit' && phaseTimeRef.current > 0.72) startGame();
      else if (phaseRef.current === 'entering' && phaseTimeRef.current > 2.15) { setMessage(''); setGamePhase('done'); }

      ctx.imageSmoothingEnabled = false; rect(ctx, 0, 0, canvas.width, canvas.height, COLORS.black);
      const image = imageRef.current; const progress = Math.min(1, worldXRef.current / WORLD_END);
      if (image) {
        const sourceHeight = image.height; const sourceWidth = Math.min(image.width, sourceHeight * (canvas.width / canvas.height));
        const sourceX = Math.floor((image.width - sourceWidth) * progress);
        ctx.drawImage(image, sourceX, 0, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
      }
      rect(ctx, 0, ground, canvas.width, canvas.height - ground, COLORS.black); rect(ctx, 0, ground, canvas.width, 4, COLORS.cream);
      for (let x = -((Math.floor(worldXRef.current) * 2) % 24); x < canvas.width; x += 24) rect(ctx, x, ground + 9, 12, 3, COLORS.brown);
      const cameraX = worldXRef.current - playerScreenX;
      OBSTACLES.forEach((obstacle) => { const screenX = obstacle.x - cameraX; if (screenX > -80 && screenX < canvas.width + 80) drawObstacle(ctx, obstacle, screenX, ground, time / 1000); });
      const doorScreenX = DOOR_X - cameraX;
      if (doorScreenX < canvas.width + 120) drawDoor(ctx, doorScreenX, ground, phaseRef.current === 'entering' ? Math.min(1, phaseTimeRef.current / 0.8) : 0);
      const enteringShift = phaseRef.current === 'entering' ? Math.min(45, phaseTimeRef.current * 23) : 0;
      drawRunner(ctx, playerScreenX + enteringShift, ground, jumpYRef.current, Math.floor(time / 130), phaseRef.current === 'entering');
      if (phaseRef.current === 'hit') { ctx.globalAlpha = Math.floor(phaseTimeRef.current * 14) % 2 ? 0.76 : 0.2; rect(ctx, 0, 0, canvas.width, canvas.height, COLORS.cream); ctx.globalAlpha = 1; }
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render); return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [setGamePhase, startGame]);

  const handleGamePointer = (event: React.PointerEvent<HTMLDivElement>) => { if (!(event.target as HTMLElement).closest('a, button')) jump(); };
  return (
    <main className={`game-shell phase-${phase}`}>
      <section className="game-screen" aria-label="La Botte Fatale, avventura pixel-art" onPointerDown={handleGamePointer}>
        <canvas ref={canvasRef} className="game-canvas" aria-label="Corri verso La Botte Fatale e salta gli ostacoli" />
        <header className="hud">
          <div className="hud-brand"><span>NOTTE 01</span><strong>LA BOTTE FATALE</strong></div>
          <div className="hud-bottles" aria-label={`${bottles} bottiglie raccolte su 4`}><span>BOTTIGLIE</span><div>{[0, 1, 2, 3].map((index) => <i key={index} className={index < bottles ? 'full' : ''} />)}</div></div>
        </header>
        <div className={`game-message ${message ? 'visible' : ''}`} role="status" aria-live="polite">{message}</div>
        {phase === 'intro' && <div className="start-layer"><div className="title-plaque"><p>UN GIOCO DI VINO E DESTINO</p><h1>LA BOTTE<br />FATALE</h1><button type="button" onClick={startGame}>PREMI PER INIZIARE</button><small>TAP · CLICK · SPAZIO PER SALTARE</small></div></div>}
        {phase === 'playing' && <div className="jump-prompt" aria-hidden="true">TAP / SPAZIO <b>↑</b></div>}
        {phase === 'done' && <div className="final-layer"><div className="final-card">
          <div className="pixel-bottle" aria-hidden="true"><i /><b /><em /></div><p className="arrival">STAGE CLEAR · 4/4 BOTTIGLIE</p><h2>LA BOTTE<br />FATALE</h2><p className="tagline">Vino, bottiglie e incontri fatali.</p>
          <div className="details"><div><span>INDIRIZZO</span><strong>Via [indirizzo], [città]</strong></div><div><span>ORARI</span><strong>[giorni] · [orari]</strong></div><div><span>INSTAGRAM</span><a href="#" aria-label="Instagram, link da inserire">@[instagram]</a></div><div><span>MAPPA</span><a href="https://www.google.com/maps/search/?api=1&query=La+Botte+Fatale" target="_blank" rel="noreferrer">GOOGLE MAPS ↗</a></div></div>
          <a className="enter-button" href="https://www.google.com/maps/search/?api=1&query=La+Botte+Fatale" target="_blank" rel="noreferrer">ENTRA NELLA BOTTE <span>→</span></a><button className="replay" type="button" onClick={startGame}>↺ RIGIOCA</button>
        </div></div>}
      </section>
    </main>
  );
}
