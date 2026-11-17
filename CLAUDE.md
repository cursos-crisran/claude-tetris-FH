# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Resumen

Tetris en JavaScript vanilla con HTML5 Canvas. Sin dependencias, sin `package.json`, sin build, sin linter ni tests. La documentación del proyecto (README.md) está en español, y la UI también (`lang="es"`); mantén el español en textos visibles y comentarios.

## Ejecutar

- Abrir `index.html` directamente en el navegador, o servir estático: `python3 -m http.server 8000` y abrir `http://localhost:8000`.
- No hay comandos de build, lint ni tests. Verifica los cambios jugando en el navegador.

## Arquitectura

Tres archivos: `index.html` (estructura y IDs del DOM), `style.css` (estilos), `game.js` (toda la lógica, cargado con `<script>` al final del body).

`game.js` es un único script en modo estricto con estado global mutable (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.), reiniciado por `init()`. Puntos clave que requieren entender varias funciones a la vez:

- **Piezas**: `PIECES` y `COLORS` se indexan por el mismo número (1–8; la 8 es la tuerca 3×3 con centro vacío). Cada celda de la matriz de la pieza guarda su propio índice de color, y ese mismo valor se escribe en `board` al fijarla (`merge`); `0` es vacío. Añadir una pieza implica tocar ambos arrays; `randomPiece()` usa `PIECES.length - 1`, así que no hay que cambiar nada más.
- **Bucle**: `loop(ts)` (vía `requestAnimationFrame`) acumula `dropAccum` y baja la pieza cuando supera `dropInterval`; si no puede bajar llama a `lockPiece()`. `animId` se cancela en pausa, game over e `init()`.
- **Ciclo de pieza**: `lockPiece()` → `merge()` → `clearLines()` (actualiza puntuación, nivel y `dropInterval`) → `spawn()` (toma `next`, genera otra y llama a `endGame()` si la nueva pieza colisiona).
- **Colisión/rotación**: `collide(shape, ox, oy)` es la base de movimiento, rotación (`tryRotate` con wall kicks `[0,-1,1,-2,2]`), pieza fantasma (`ghostY`) y hard drop.
- **Puntuación**: `LINE_SCORES × level`, +1 por soft drop, +2 por celda en hard drop. Nivel = `floor(lines/10)+1`; `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Input**: un solo listener `keydown` (flechas, `X` rota, `Space` hard drop, `P` pausa). El overlay de pausa/game over se reutiliza cambiando `overlay-title`/`overlay-score`; el botón de reinicio llama a `init()`.
- **Render**: `draw()` pinta cuadrícula, tablero, fantasma (alpha 0.2) y pieza actual; `drawNext()` dibuja la siguiente en un canvas aparte de 4×4 bloques.

Las dimensiones del canvas (`300×600`, `120×120`) están duplicadas entre `index.html` y las constantes `COLS`/`ROWS`/`BLOCK` de `game.js`; deben mantenerse coherentes (`COLS*BLOCK` × `ROWS*BLOCK`).
