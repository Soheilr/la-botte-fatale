# La Botte Fatale

Gioco sidescroller pixel-art e sito ufficiale di La Botte Fatale.

## Avvio locale

Richiede Node.js 22+ e pnpm.

```bash
pnpm install
pnpm dev
```

## Build

Build per ChatGPT Sites:

```bash
pnpm build
```

Build statico per GitHub Pages o hosting con dominio personalizzato:

```bash
pnpm build:pages
```

L'output statico viene creato in `docs/`. Tutti gli asset usano percorsi relativi, quindi il sito funziona sia in una sottocartella GitHub Pages sia alla radice di un dominio personalizzato.

## Pubblicazione GitHub Pages

Il repository è predisposto per pubblicare il contenuto di `docs/` dal branch `main`. Dopo ogni modifica, eseguire `pnpm build:pages`, aggiungere il nuovo contenuto di `docs/` e fare push su `main`.
