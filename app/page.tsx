'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Phase = 'intro' | 'playing' | 'hit' | 'entering' | 'done';
type ObstacleKind = 'mushroom-red' | 'mushroom-purple' | 'mushroom-gold' | 'mushroom-toxic' | 'mushroom-cluster';
type Obstacle = { x: number; width: number; height: number; kind: ObstacleKind; label: string };
type Collectible = { x: number; height: number; label: string; high?: boolean };
type AudioKit = { ctx: AudioContext; master: GainNode; musicTimer: number | null; musicStep: number };
type ModelContext = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: () => unknown }, options?: { signal?: AbortSignal }) => void | Promise<void> };

const WORLD_END = 3570;
const DOOR_X = 3320;
const SPEED = 158;
const GRAVITY = 720;
const JUMP_POWER = 340;
const DOUBLE_JUMP_POWER = 405;
const PLAYER_SCALE = 1.27;
const PLATFORM = { x: 2510, width: 245, height: 70 };

const OBSTACLES: Obstacle[] = [
  { x: 455, width: 42, height: 34, kind: 'mushroom-red', label: 'fungo velenoso rosso' },
  { x: 960, width: 48, height: 29, kind: 'mushroom-purple', label: 'fungo velenoso viola' },
  { x: 1470, width: 51, height: 40, kind: 'mushroom-gold', label: 'fungo velenoso dorato' },
  { x: 1995, width: 54, height: 35, kind: 'mushroom-toxic', label: 'fungo velenoso tossico' },
  { x: 2570, width: 125, height: 64, kind: 'mushroom-cluster', label: 'colonia di funghi velenosi' },
];

const COLLECTIBLES: Collectible[] = [
  { x: 555, height: 40, label: 'bottiglia delle vigne' },
  { x: 1065, height: 42, label: 'bottiglia della periferia' },
  { x: 1575, height: 42, label: 'bottiglia del vicolo' },
  { x: 2165, height: 145, label: 'bottiglia del doppio salto', high: true },
  { x: 2705, height: 94, label: 'bottiglia della passerella' },
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

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, color = COLORS.cream) {
  const s = frame % 2 === 0 ? 5 : 3;
  rect(ctx, x - 1, y - s, 3, s * 2 + 1, color);
  rect(ctx, x - s, y - 1, s * 2 + 1, 3, color);
}

function drawRunner(ctx: CanvasRenderingContext2D, x: number, ground: number, jumpY: number, frame: number, entering: boolean) {
  const baseHeight = 32;
  const y = ground - baseHeight * PLAYER_SCALE - jumpY;
  const step = jumpY > 2 ? 1 : frame % 2;
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(PLAYER_SCALE, PLAYER_SCALE);
  // Lina keeps her scarf and apron; her long black hair and tiny beard are unmistakable.
  rect(ctx, -5, 5, 10, 16, COLORS.black); rect(ctx, -8, 9, 7, 15, COLORS.black); rect(ctx, -11 - step, 15, 7, 11, COLORS.black);
  rect(ctx, -4 - step * 2, 10, 9, 4, COLORS.cream); rect(ctx, -8 - step * 3, 8, 8, 3, COLORS.red);
  rect(ctx, 2, 1, 16, 12, COLORS.black); rect(ctx, 0, 4, 7, 10, COLORS.black);
  rect(ctx, 6, 5, 10, 8, COLORS.cream); rect(ctx, 14, 7, 3, 3, COLORS.black); rect(ctx, 11, 11, 7, 5, COLORS.black); rect(ctx, 14, 10, 4, 3, COLORS.brown); rect(ctx, 4, 12, 14, 13, COLORS.black);
  rect(ctx, 7, 13, 8, 5, COLORS.cream); rect(ctx, 5, 18, 12, 8, COLORS.green); rect(ctx, 8, 19, 6, 5, COLORS.cream); rect(ctx, 10, 20, 2, 3, COLORS.red);
  rect(ctx, 0, 14 + step * 2, 5, 10, COLORS.cream); rect(ctx, 17, 14 + (1 - step) * 2, 5, 10, COLORS.cream); rect(ctx, 1, 13, 3, 8, COLORS.green);
  if (entering) { rect(ctx, 7, 25, 5, 7, COLORS.brown); rect(ctx, 13, 25, 5, 7, COLORS.brown); }
  else { rect(ctx, 4, 25 + step * 2, 7, 4, COLORS.brown); rect(ctx, 14, 25 + (1 - step) * 2, 7, 4, COLORS.brown); }
  ctx.restore();
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle, x: number, ground: number, t: number) {
  const y = ground - obstacle.height;
  const bob = Math.floor(t * 6) % 2;
  const colors: Record<ObstacleKind, string> = { 'mushroom-red': COLORS.red, 'mushroom-purple': COLORS.purple, 'mushroom-gold': COLORS.gold, 'mushroom-toxic': COLORS.lightGreen, 'mushroom-cluster': COLORS.red };
  const mushroom = (mx: number, mw: number, mh: number, color: string, flip = false) => {
    const my = ground - mh + bob; const stemW = Math.max(8, Math.round(mw * .28)); const stemX = mx + Math.round((mw - stemW) / 2);
    rect(ctx, stemX - 3, my + Math.round(mh * .45), stemW + 6, Math.round(mh * .55), COLORS.black);
    rect(ctx, stemX, my + Math.round(mh * .5), stemW, Math.round(mh * .45), COLORS.cream);
    rect(ctx, mx + 5, my, mw - 10, 5, COLORS.black); rect(ctx, mx, my + 5, mw, Math.round(mh * .42), COLORS.black);
    rect(ctx, mx + 5, my + 5, mw - 10, Math.round(mh * .3), color); rect(ctx, mx + 2, my + Math.round(mh * .28), mw - 4, 5, color);
    rect(ctx, mx + (flip ? mw - 13 : 8), my + 8, 6, 6, COLORS.cream); rect(ctx, mx + (flip ? 8 : mw - 14), my + 14, 5, 5, COLORS.cream);
    rect(ctx, stemX + 2, my + Math.round(mh * .61), 3, 3, COLORS.black); rect(ctx, stemX + stemW - 5, my + Math.round(mh * .61), 3, 3, COLORS.black);
    rect(ctx, stemX + Math.round(stemW / 2) - 1, my + Math.round(mh * .71), 4, 3, COLORS.red);
  };
  if (obstacle.kind === 'mushroom-cluster') {
    rect(ctx, x, ground - 8, obstacle.width, 8, COLORS.black);
    for (let i = 0; i < 4; i++) mushroom(x + i * 30, 35, 39 + (i % 2) * 15, i % 2 ? COLORS.purple : COLORS.red, i % 2 === 1);
  } else mushroom(x, obstacle.width, obstacle.height, colors[obstacle.kind], obstacle.kind === 'mushroom-purple');
}

function drawPlatform(ctx: CanvasRenderingContext2D, x: number, ground: number, t: number) {
  const y = ground - PLATFORM.height;
  rect(ctx, x, y, PLATFORM.width, 10, COLORS.black); rect(ctx, x + 4, y + 3, PLATFORM.width - 8, 4, COLORS.cream);
  for (let px = x + 12; px < x + PLATFORM.width - 8; px += 24) { rect(ctx, px, y + 10, 5, PLATFORM.height - 10, COLORS.black); rect(ctx, px + 5, y + 18, 9, 4, COLORS.brown); }
  const pulse = Math.floor(t * 4) % 2; rect(ctx, x + 72, y - 18, 101, 17, COLORS.black); rect(ctx, x + 76, y - 14, 93, 9, pulse ? COLORS.gold : COLORS.cream);
  ctx.fillStyle = COLORS.black; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.fillText('PASSERELLA DEL VINO', x + 122, y - 7);
}

function drawMilestone(ctx: CanvasRenderingContext2D, x: number, ground: number, label: string, kind: 'post' | 'wall') {
  if (kind === 'post') {
    rect(ctx, x + 8, ground - 48, 5, 48, COLORS.black); rect(ctx, x + 1, ground - 55, 73, 24, COLORS.black); rect(ctx, x + 5, ground - 51, 65, 16, COLORS.cream);
    ctx.fillStyle = COLORS.black; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.fillText(label, x + 37, ground - 40);
  } else {
    rect(ctx, x, ground - 96, 94, 24, COLORS.black); rect(ctx, x + 4, ground - 92, 86, 16, COLORS.burgundy);
    ctx.fillStyle = COLORS.cream; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.fillText(label, x + 47, ground - 81);
  }
}

function drawDoor(ctx: CanvasRenderingContext2D, x: number, ground: number, opening: number, t: number, signImage: HTMLImageElement | null) {
  const w = 148; const h = 145; const y = ground - h; const pulse = Math.floor(t * 4) % 2;
  rect(ctx, x - 10, y + 20, w + 20, h - 20, COLORS.black); rect(ctx, x - 5, y + 25, w + 10, h - 25, COLORS.burgundy);
  rect(ctx, x, y, w, 47, COLORS.black); rect(ctx, x + 6, y + 6, w - 12, 35, pulse ? COLORS.cream : COLORS.gold);
  if (signImage) ctx.drawImage(signImage, 120, 480, 820, 190, x + 7, y + 7, w - 14, 32);
  for (let i = 0; i < 10; i++) rect(ctx, x + 8 + i * 14, y + 45, 6, 6, (i + pulse) % 2 === 0 ? COLORS.cream : COLORS.red);
  rect(ctx, x + 21, y + 57, 106, 88, COLORS.black); rect(ctx, x + 27, y + 63, 94, 76, COLORS.gold);
  const panel = Math.max(0, 44 - Math.floor(opening * 44)); rect(ctx, x + 27, y + 63, panel, 76, COLORS.green); rect(ctx, x + 77 + (44 - panel), y + 63, panel, 76, COLORS.green);
  rect(ctx, x + 72, y + 96, 4, 4, COLORS.cream); drawBottle(ctx, x - 2, y + 78, 1.3); drawBottle(ctx, x + w - 15, y + 78, 1.3);
  drawSparkle(ctx, x + 8, y + 17, pulse); drawSparkle(ctx, x + w - 9, y + 17, 1 - pulse); rect(ctx, x - 14, ground - 7, w + 28, 7, COLORS.lightBrown);
}

function drawInterior(ctx: CanvasRenderingContext2D, width: number, height: number, t: number) {
  rect(ctx, 0, 0, width, height, COLORS.black); rect(ctx, 0, 0, width, Math.round(height * .75), COLORS.burgundy);
  for (let y = 12; y < height * .75; y += 18) for (let x = (Math.floor(y / 18) % 2) * -16; x < width; x += 32) rect(ctx, x, y, 28, 3, '#7b2339');
  const shelfTop = Math.max(54, Math.round(height * .19));
  for (const sy of [shelfTop, shelfTop + 54]) { rect(ctx, 12, sy, Math.round(width * .39), 13, COLORS.black); rect(ctx, 18, sy + 6, Math.round(width * .37), 5, COLORS.lightBrown); }
  for (let row = 0; row < 2; row++) for (let i = 0; i < Math.floor(width / 34); i++) drawBottle(ctx, 24 + i * 18, shelfTop + 17 + row * 54, .55, .92);
  const lampGlow = Math.floor(t * 3) % 2 ? COLORS.cream : COLORS.gold;
  for (const lx of [Math.round(width * .2), Math.round(width * .52), Math.round(width * .83)]) { rect(ctx, lx, 0, 4, 24, COLORS.black); rect(ctx, lx - 10, 22, 24, 7, COLORS.black); rect(ctx, lx - 15, 28, 34, 18, COLORS.black); rect(ctx, lx - 10, 31, 24, 11, lampGlow); }
  const counterY = Math.round(height * .7); rect(ctx, 0, counterY, width, 13, COLORS.black); rect(ctx, 0, counterY + 6, width, 7, COLORS.lightBrown); rect(ctx, Math.round(width * .28), counterY + 12, Math.round(width * .58), height - counterY, COLORS.brown);
  for (let x = Math.round(width * .3); x < width * .84; x += 28) rect(ctx, x, counterY + 24, 5, height - counterY - 24, COLORS.black);
  for (const sx of [Math.round(width * .12), Math.round(width * .9)]) { rect(ctx, sx - 13, counterY + 23, 30, 8, COLORS.black); rect(ctx, sx, counterY + 31, 5, 29, COLORS.black); rect(ctx, sx - 9, counterY + 58, 23, 5, COLORS.black); }
  rect(ctx, 0, height - 18, width, 18, COLORS.black); for (let x = -10; x < width; x += 32) rect(ctx, x, height - 15, 22, 4, COLORS.lightBrown);
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const signRef = useRef<HTMLImageElement | null>(null);
  const audioRef = useRef<AudioKit | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const sceneTimeRef = useRef(0);
  const worldXRef = useRef(0);
  const jumpYRef = useRef(0);
  const velocityRef = useRef(0);
  const jumpsRef = useRef(0);
  const supportRef = useRef<'ground' | 'platform' | null>('ground');
  const phaseRef = useRef<Phase>('intro');
  const phaseTimeRef = useRef(0);
  const pausedRef = useRef(false);
  const messageTimerRef = useRef(0);
  const pickupFxRef = useRef<{ x: number; height: number; time: number } | null>(null);
  const collectedRef = useRef(new Set<number>());
  const [phase, setPhase] = useState<Phase>('intro');
  const [paused, setPaused] = useState(false);
  const [bottles, setBottles] = useState(0);
  const [message, setMessage] = useState('');

  const tone = useCallback((frequency: number, duration: number, volume = .04, delay = 0, type: OscillatorType = 'square') => {
    const kit = audioRef.current; if (!kit) return;
    const start = kit.ctx.currentTime + delay; const oscillator = kit.ctx.createOscillator(); const gain = kit.ctx.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(volume, start); gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(kit.master); oscillator.start(start); oscillator.stop(start + duration);
  }, []);

  const stopMusic = useCallback(() => { const kit = audioRef.current; if (kit?.musicTimer !== null && kit?.musicTimer !== undefined) { window.clearInterval(kit.musicTimer); kit.musicTimer = null; } }, []);
  const startMusic = useCallback(() => {
    const kit = audioRef.current; if (!kit || kit.musicTimer !== null) return;
    const notes = [196, 247, 294, 247, 220, 262, 330, 262];
    const beat = () => { const active = audioRef.current; if (!active || pausedRef.current || phaseRef.current === 'done') return; const note = notes[active.musicStep % notes.length]; tone(note, .12, .018); if (active.musicStep % 4 === 0) tone(note / 2, .16, .025, 0, 'triangle'); active.musicStep++; };
    beat(); kit.musicTimer = window.setInterval(beat, 185);
  }, [tone]);

  const initAudio = useCallback(() => {
    if (!audioRef.current || audioRef.current.ctx.state === 'closed') {
      const AudioConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioConstructor) return;
      const ctx = new AudioConstructor(); const master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination);
      audioRef.current = { ctx, master, musicTimer: null, musicStep: 0 };
    }
    void audioRef.current.ctx.resume().catch(() => undefined);
  }, []);

  const playSfx = useCallback((kind: 'jump' | 'double' | 'bottle' | 'fail' | 'enter') => {
    if (kind === 'jump') { tone(290, .08, .05); tone(420, .08, .04, .06); }
    if (kind === 'double') { tone(420, .08, .055); tone(620, .1, .05, .06); tone(820, .08, .04, .13); }
    if (kind === 'bottle') { tone(660, .08, .05); tone(880, .09, .05, .08); tone(1100, .12, .045, .17); }
    if (kind === 'fail') { tone(190, .12, .07); tone(120, .16, .065, .09); tone(72, .24, .06, .2, 'sawtooth'); }
    if (kind === 'enter') { [262, 330, 392, 523].forEach((note, i) => tone(note, .18, .06, i * .11)); }
  }, [tone]);

  const showMessage = useCallback((text: string, duration = .82) => { setMessage(text); messageTimerRef.current = duration; }, []);
  const setGamePhase = useCallback((next: Phase) => { phaseRef.current = next; phaseTimeRef.current = 0; setPhase(next); }, []);
  const startGame = useCallback(() => {
    initAudio(); pausedRef.current = false; setPaused(false); worldXRef.current = 0; jumpYRef.current = 0; velocityRef.current = 0; jumpsRef.current = 0; supportRef.current = 'ground'; collectedRef.current = new Set(); pickupFxRef.current = null;
    setBottles(0); setMessage(''); messageTimerRef.current = 0; setGamePhase('playing'); startMusic();
  }, [initAudio, setGamePhase, startMusic]);

  const jump = useCallback(() => {
    if (phaseRef.current !== 'playing' || pausedRef.current) return;
    if (supportRef.current !== null) {
      velocityRef.current = JUMP_POWER; jumpsRef.current = 1; supportRef.current = null; playSfx('jump');
    } else if (jumpsRef.current === 1) {
      velocityRef.current = DOUBLE_JUMP_POWER; jumpsRef.current = 2; playSfx('double'); showMessage('DOPPIO STAPPO!', .5);
    }
  }, [playSfx, showMessage]);

  const togglePause = useCallback(() => {
    if (phaseRef.current === 'intro' || phaseRef.current === 'done') return;
    const next = !pausedRef.current; pausedRef.current = next; setPaused(next);
    const kit = audioRef.current;
    if (next) { stopMusic(); if (kit) void kit.ctx.suspend(); }
    else { if (kit) void kit.ctx.resume().then(startMusic).catch(() => undefined); }
  }, [startMusic, stopMusic]);

  useEffect(() => {
    const image = new Image(); image.src = '/wine-world.png'; image.onload = () => { imageRef.current = image; };
    const sign = new Image(); sign.src = '/insegna-botte-1.png'; sign.onload = () => { signRef.current = sign; };
    const canvas = canvasRef.current; if (!canvas) return;
    const resize = () => { const box = canvas.getBoundingClientRect(); canvas.width = Math.max(320, Math.floor(box.width / 3)); canvas.height = Math.max(190, Math.floor(box.height / 3)); };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize(); return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'ArrowUp') { event.preventDefault(); jump(); }
      if (event.code === 'KeyP') { event.preventDefault(); togglePause(); }
    };
    window.addEventListener('keydown', onKeyDown, { passive: false }); return () => window.removeEventListener('keydown', onKeyDown);
  }, [jump, togglePause]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext; if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({ name: 'start_wine_adventure', title: 'Inizia l’avventura', description: 'Avvia o riavvia il gioco visibile de La Botte Fatale.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => { startGame(); return { status: 'playing', bottles: 0 }; } }, { signal: lifecycle.signal });
      await context.registerTool({ name: 'jump_wine_adventure', title: 'Salta', description: 'Fa saltare Lina; una seconda chiamata in aria esegue il doppio salto.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => { jump(); return { status: phaseRef.current, bottles: collectedRef.current.size, jumps: jumpsRef.current, support: supportRef.current, height: Math.round(jumpYRef.current) }; } }, { signal: lifecycle.signal });
      await context.registerTool({ name: 'pause_wine_adventure', title: 'Pausa o riprendi', description: 'Mette in pausa o riprende il gioco visibile dallo stesso punto.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => { togglePause(); return { paused: pausedRef.current }; } }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined); return () => lifecycle.abort();
  }, [jump, startGame, togglePause]);

  useEffect(() => {
    const render = (time: number) => {
      const canvas = canvasRef.current; const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) { rafRef.current = requestAnimationFrame(render); return; }
      const dt = Math.min((time - (lastRef.current || time)) / 1000, .034); lastRef.current = time;
      if (!pausedRef.current) { phaseTimeRef.current += dt; sceneTimeRef.current += dt; if (messageTimerRef.current > 0) { messageTimerRef.current -= dt; if (messageTimerRef.current <= 0) setMessage(''); } if (pickupFxRef.current) pickupFxRef.current.time += dt; }
      const sceneTime = sceneTimeRef.current; const ground = canvas.height - 35; const playerScreenX = Math.round(canvas.width * .2);

      if (!pausedRef.current && phaseRef.current === 'playing') {
        worldXRef.current += SPEED * dt;
        const oldY = jumpYRef.current; velocityRef.current -= GRAVITY * dt; const nextY = oldY + velocityRef.current * dt;
        const onPlatformX = worldXRef.current + 22 > PLATFORM.x && worldXRef.current < PLATFORM.x + PLATFORM.width;
        if (velocityRef.current <= 0 && onPlatformX && oldY >= PLATFORM.height && nextY <= PLATFORM.height) { jumpYRef.current = PLATFORM.height; velocityRef.current = 0; jumpsRef.current = 0; supportRef.current = 'platform'; }
        else if (nextY <= 0) { jumpYRef.current = 0; velocityRef.current = 0; jumpsRef.current = 0; supportRef.current = 'ground'; }
        else { jumpYRef.current = nextY; supportRef.current = null; }

        for (const obstacle of OBSTACLES) {
          const overlap = worldXRef.current + 24 > obstacle.x && worldXRef.current - 5 < obstacle.x + obstacle.width;
          if (overlap && jumpYRef.current < obstacle.height - 5) { showMessage('BOTTE FATTA!  SI RIPARTE', .68); playSfx('fail'); setGamePhase('hit'); break; }
        }

        COLLECTIBLES.forEach((bottle, index) => {
          if (collectedRef.current.has(index)) return;
          const nearX = Math.abs(worldXRef.current + 10 - bottle.x) < 30; const playerCenterHeight = jumpYRef.current + 21;
          if (nearX && Math.abs(playerCenterHeight - bottle.height) < 24) {
            collectedRef.current.add(index); setBottles(collectedRef.current.size); pickupFxRef.current = { x: bottle.x, height: bottle.height, time: 0 }; showMessage('+1 BOTTIGLIA', 1); playSfx('bottle');
          }
        });

        if (worldXRef.current >= DOOR_X - 12) {
          worldXRef.current = DOOR_X - 12;
          showMessage('LA PORTA FATALE SI APRE', 1.25); playSfx('enter'); setGamePhase('entering');
        }
      } else if (!pausedRef.current && phaseRef.current === 'hit' && phaseTimeRef.current > .72) startGame();
      else if (!pausedRef.current && phaseRef.current === 'entering' && phaseTimeRef.current > 2.25) { setMessage(''); stopMusic(); setGamePhase('done'); }

      ctx.imageSmoothingEnabled = false;
      if (phaseRef.current === 'done') drawInterior(ctx, canvas.width, canvas.height, sceneTime);
      else {
        rect(ctx, 0, 0, canvas.width, canvas.height, COLORS.black);
        const image = imageRef.current; const progress = Math.min(1, worldXRef.current / WORLD_END);
        if (image) { const sourceHeight = image.height; const sourceWidth = Math.min(image.width, sourceHeight * (canvas.width / canvas.height)); const sourceX = Math.floor((image.width - sourceWidth) * progress); ctx.drawImage(image, sourceX, 0, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height); }
        rect(ctx, 0, ground, canvas.width, canvas.height - ground, COLORS.black); rect(ctx, 0, ground, canvas.width, 4, COLORS.cream);
        for (let x = -((Math.floor(worldXRef.current) * 2) % 24); x < canvas.width; x += 24) rect(ctx, x, ground + 9, 12, 3, COLORS.brown);
        const cameraX = worldXRef.current - playerScreenX;
        const signs = [{ x: 70, label: 'VIGNE STORTE', kind: 'post' as const }, { x: 750, label: 'PERIFERIA', kind: 'post' as const }, { x: 1370, label: 'VICOLO DEL VINO', kind: 'wall' as const }];
        signs.forEach((sign) => { const sx = sign.x - cameraX; if (sx > -110 && sx < canvas.width + 110) drawMilestone(ctx, sx, ground, sign.label, sign.kind); });
        const lessonX = 2070 - cameraX; if (lessonX > -100 && lessonX < canvas.width + 100) { drawMilestone(ctx, lessonX, ground, 'TAP TAP ↑↑', 'post'); drawSparkle(ctx, lessonX + 38, ground - 118, Math.floor(sceneTime * 5), COLORS.gold); }
        OBSTACLES.forEach((obstacle) => { const screenX = obstacle.x - cameraX; if (screenX > -150 && screenX < canvas.width + 150) drawObstacle(ctx, obstacle, screenX, ground, sceneTime); });
        const platformX = PLATFORM.x - cameraX; if (platformX > -PLATFORM.width - 40 && platformX < canvas.width + 40) drawPlatform(ctx, platformX, ground, sceneTime);
        COLLECTIBLES.forEach((bottle, index) => {
          if (collectedRef.current.has(index)) return;
          const bx = bottle.x - cameraX; if (bx > -40 && bx < canvas.width + 40) { const by = ground - bottle.height - 14 - Math.floor(Math.sin(sceneTime * 4) * 3); drawBottle(ctx, bx, by, bottle.high ? 1.08 : .82); drawSparkle(ctx, bx + 7, by - 7, Math.floor(sceneTime * 5), bottle.high ? COLORS.gold : COLORS.cream); }
        });
        const pickup = pickupFxRef.current;
        if (pickup && pickup.time < 1.05) { const fx = pickup.x - cameraX; const rise = Math.sin(Math.min(1, pickup.time * 1.25) * Math.PI) * 28; const scale = 1 + Math.sin(Math.min(1, pickup.time) * Math.PI) * .45; drawBottle(ctx, fx, ground - pickup.height - 22 - rise, scale, 1 - pickup.time / 1.05); }
        else if (pickup) pickupFxRef.current = null;
        const doorScreenX = DOOR_X - cameraX; if (doorScreenX < canvas.width + 180) drawDoor(ctx, doorScreenX, ground, phaseRef.current === 'entering' ? Math.min(1, phaseTimeRef.current / .9) : 0, sceneTime, signRef.current);
        const enteringShift = phaseRef.current === 'entering' ? Math.min(72, phaseTimeRef.current * 33) : 0; drawRunner(ctx, playerScreenX + enteringShift, ground, jumpYRef.current, Math.floor(sceneTime * 8), phaseRef.current === 'entering');
        if (phaseRef.current === 'hit') { ctx.globalAlpha = Math.floor(sceneTime * 14) % 2 ? .72 : .18; rect(ctx, 0, 0, canvas.width, canvas.height, COLORS.cream); ctx.globalAlpha = 1; }
      }
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render); return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playSfx, setGamePhase, showMessage, startGame, stopMusic]);

  useEffect(() => () => {
    stopMusic();
    const kit = audioRef.current;
    audioRef.current = null;
    if (kit && kit.ctx.state !== 'closed') void kit.ctx.close().catch(() => undefined);
  }, [stopMusic]);

  const handleGamePointer = (event: React.PointerEvent<HTMLDivElement>) => { if (!(event.target as HTMLElement).closest('a, button')) jump(); };
  const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=Via+Giuseppe+Giacosa+11+20127+Milano+MI';

  return (
    <main className={`game-shell phase-${phase} ${paused ? 'is-paused' : ''}`}>
      <section className="game-screen" aria-label="La Botte Fatale, avventura pixel-art" onPointerDown={handleGamePointer}>
        <canvas ref={canvasRef} className="game-canvas" aria-label="Corri verso La Botte Fatale, salta gli ostacoli e raccogli cinque bottiglie" />
        {phase !== 'done' && <header className="hud">
          <div className="hud-brand"><span>LA NOTTE DI LINA</span><strong>LA BOTTE FATALE</strong></div>
          <button className="pause-button" type="button" aria-pressed={paused} onClick={togglePause}>{paused ? 'RIPRENDI' : 'PAUSA'} <kbd>P</kbd></button>
          <div className="hud-bottles" aria-label={`${bottles} bottiglie raccolte su 5`}><span>LA CANTINETTA · {bottles}/5</span><div>{[0,1,2,3,4].map((index) => <i key={index} className={index < bottles ? 'full' : ''}><b /><em /></i>)}</div></div>
        </header>}
        <div className={`game-message ${message ? 'visible' : ''}`} role="status" aria-live="polite"><span>{message}</span>{message === '+1 BOTTIGLIA' && <i className="pickup-icon"><b /><em /></i>}</div>
        {paused && <div className="pause-layer"><div><span>LA NOTTE È SOSPESA</span><strong>PAUSA</strong><small>RIPRENDI DALLO STESSO PUNTO</small></div></div>}
        {phase === 'intro' && <div className="start-layer"><div className="title-lockup"><div className="title-rule"><i /> <span>UNA NOTTE · CINQUE BOTTIGLIE</span> <i /></div><div className="official-logo" role="img" aria-label="La Botte Fatale"><img src="/logo-botte-fatale.png" alt="" /></div><p>Porta Lina fino all’ultima luce della città.</p><button type="button" onClick={startGame}>STAPPA LA NOTTE <span>→</span></button><small>TAP · CLICK · SPAZIO · DUE VOLTE PER IL DOPPIO SALTO</small></div></div>}
        {phase === 'playing' && <div className="jump-prompt" aria-hidden="true">SALTO / DOPPIO SALTO <b>↑↑</b></div>}
        {phase === 'done' && <div className="final-layer">
          <div className="final-marquee"><p>LA PORTA ERA QUELLA GIUSTA</p><div className="official-logo final-logo" role="img" aria-label="La Botte Fatale"><img src="/logo-botte-fatale.png" alt="" /></div><strong>Vino, bottiglie e incontri fatali.</strong><div className="final-score"><span>BOTTIGLIE TROVATE · {bottles}/5</span><div className="score-bottles" aria-label={`${bottles} bottiglie raccolte su 5`}>{[0,1,2,3,4].map((index) => <i key={index} className={index < bottles ? 'full' : ''}><b /><em /></i>)}</div></div></div>
          <div className="bar-info">
            <a className="bar-note address" href={mapsUrl} target="_blank" rel="noreferrer"><span>DOVE TROVARCI</span><b>Via Giuseppe Giacosa, 11<br />20127 Milano MI</b></a>
            <div className="bar-note hours"><span>LUCI ACCESE</span><ul className="hours-list"><li><i>Monday</i><b>16:00–23:00</b></li><li><i>Tuesday</i><b>16:00–23:00</b></li><li><i>Wednesday</i><b>16:00–23:00</b></li><li><i>Thursday</i><b>16:00–23:00</b></li><li><i>Friday</i><b>17:00–23:00</b></li><li><i>Saturday</i><b>17:00–23:00</b></li><li><i>Sunday</i><b>Closed</b></li></ul></div>
            <a className="bar-note instagram" href="https://www.instagram.com/enoteca.labotte/" target="_blank" rel="noreferrer"><span>INSTAGRAM</span><b>@enoteca.labotte ↗</b></a>
            <a className="bar-note map" href={mapsUrl} target="_blank" rel="noreferrer"><span>SEGUI LA STRADA</span><b>GOOGLE MAPS ↗</b></a>
          </div>
          <div className="bar-actions"><a className="enter-button" href={mapsUrl} target="_blank" rel="noreferrer">ENTRA NELLA BOTTE <span>→</span></a><button className="replay" type="button" onClick={startGame}>↺ UN’ALTRA NOTTE</button></div>
        </div>}
      </section>
    </main>
  );
}
