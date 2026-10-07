# Sound Compare

Choose 2 to 10 MP3 or MP4 files and get:

1. **Listening comfort**: which file is most comfortable to listen to, a
   score out of 100 for each, and what to change (raise or lower volume,
   cut harsh or muddy ranges, limit peaks, trim silence) with numbers.
2. **Similarity**: how alike each pair of sounds is.
3. **Full analysis**: loudness, peaks, dynamics, tone, tempo, key, charts.

The page is in Thai and English, with a switch in the top corner.

The summary at the top ranks the files, highlights the most comfortable
one, and shows: comfort score, loudness (LUFS), peak, presence 2-5k vs
body 200-500, harsh 5-8k vs body, hiss 8k+ vs body, dynamic range p95-p10,
digital silence (below -60 dBFS) and median level of the non silent parts.

**This is an estimate from measured numbers only, not from real listening.**
The page says so next to the result. Ears, headphones and rooms differ, so
always confirm by listening.

Everything runs in the browser. Files are never uploaded. All results come
from standard signal processing (FFT, the ITU-R BS.1770 loudness standard,
autocorrelation, correlation). No AI or trained model is used.

## Comfort rules

| Check | Comfortable | Advice when outside |
|-------|-------------|---------------------|
| Volume | music -14 LUFS, speech -16 LUFS, within 1 dB | raise or lower by the exact difference |
| Peaks | at or below -1 dBFS | limit peaks |
| Clipping | none | export again at a lower level |
| Loudness range | music 3 to 20 LU, speech up to 12 LU | less or gentle compression |
| Tone tilt | about -4.5 dB per octave, plus or minus 3 | lower or raise treble |
| Harsh 2-5 kHz, muddy 200-500 Hz, boom below 100 Hz | no bump above the overall curve | cut by the bump size, at most 6 dB |
| Sibilance 5-8 kHz vs body | at or below -15 dB | de-esser or cut 5-8 kHz |
| Hiss 8 kHz+ vs body | at or below -18 dB | noise reduction or lower above 8 kHz |
| Silence | under 2 s at the start, 3 s at the end | trim |
| Bitrate | 128 kbps or more | export at 192 kbps or higher |

Each problem takes points off 100. The file with the highest score is
called most comfortable. Scores within 3 points of the top count as equal. Tone rules are
rules of thumb, so the advice is a starting point.

## Similarity score

| Part | Weight | How |
|------|--------|-----|
| Spectrum shape | 35% | correlation of the two average spectra |
| Harmony | 25% | correlation of the two note profiles |
| Loudness shape | 25% | best correlation of the loudness curves, shifted up to 30 s |
| Tempo | 15% | tempo match, half and double time count as the same |

If either file has no clear beat, tempo is left out and the other weights
are scaled up. Only the first 10 minutes of each file are analysed.

## Run locally

Needs [Bun](https://bun.sh).

```sh
bun install
bun run dev
```

Then open http://localhost:3000. The local server uses Elysia and serves the
`public` folder, the same files GitHub Pages serves.

## Tests

```sh
bun test
```

Tests use generated tones, clicks and noise with known answers, including
the EBU reference tone (stereo 1 kHz at -23 dBFS reads -23 LUFS).

## Deploy on GitHub Pages

The workflow in `.github/workflows/pages.yml` runs the tests, builds
`public/app.js`, and publishes the `public` folder on every push to `main`
or `master`.

1. Create a repository on GitHub and push this folder to it.
2. In the repository go to Settings, then Pages, and set Source to
   **GitHub Actions**.
3. Open the Actions tab and wait for "Deploy to GitHub Pages" to finish.
4. The site is at `https://<your-user>.github.io/<repository-name>/`.
   Put that link in the repository's About box so people can click it.
