# DSP WebAudio Endpoint

Virtual ambient audio endpoint for the Time Machine engine. Receives world state over WebSocket and drives a WebAudio graph with three ambient buses.

## Quick start

1. Start the engine with routing enabled:

```bash
./tm-engine.js -l "Baton Rouge, LA" -d "07-04-1978" --timescale 120 --routes routes.example.json
```

2. Open `index.html` in a browser (file:// or served).

3. Click **Start** to begin playback (required by browser autoplay policy).

The page connects to `ws://localhost:3000/` and applies incoming DSP parameters to the audio graph.

## Buses

| Bus  | Routed param             | Stem              |
|------|--------------------------|--------------------|
| bed  | `/buses/ambience/gain`   | City ambience loop |
| wind | `/buses/wind_bed/gain`   | Wind/breeze loop   |
| rain | `/buses/rain_bed/gain`   | Rain loop          |

All gain values arrive in dB and are converted to linear: `Math.pow(10, dB / 20)`.

## Replacing stems

Edit the `STEMS` object at the top of the `<script>` block in `index.html`:

```js
const STEMS = {
  bed:  'path/to/your/ambience.mp3',
  wind: 'path/to/your/wind.mp3',
  rain: 'path/to/your/rain.mp3'
};
```

Local files work when served over HTTP. For `file://` use, relative paths to files in the same directory work in most browsers.

## Fallback mode

If the engine is running without `--routes`, the page falls back to reading `state.controls.audio.*` directly and mapping values to dB internally.

## Master gain

The master gain is set to `0.15` (about -16 dB). This is intentionally very quiet. Adjust `MASTER_GAIN` in the script if needed.
