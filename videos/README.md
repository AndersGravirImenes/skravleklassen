# Bakgrunnsvideo

Siden ser etter en fil her: **`videos/cityscape.mp4`** (loopes som bakgrunn).

Hvis filen mangler, vises CSS-bakgrunnen (gradient + regn) alene — også fint.

## Anbefalt video

En kort (10–30 sek), looping cyberpunk-/Blade Runner-aktig nattbyklipp. Ideelt:

- 1080p eller 1440p
- 5–15 MB filstørrelse (komprimer hvis større)
- Mørke toner med oransje/amber lys
- Subtil bevegelse (ikke for mye action — det skal være atmosfære)

## Gratis kilder

Søk etter "cyberpunk city", "neon street rain", "tokyo night drone":

- **Pexels** – https://www.pexels.com/search/videos/cyberpunk%20city/
- **Pixabay** – https://pixabay.com/videos/search/cyberpunk%20city/
- **Coverr** – https://coverr.co/

Last ned MP4, gi den nytt navn til `cityscape.mp4`, legg her.

## Komprimer (valgfritt)

Hvis videoen er stor, komprimer med [HandBrake](https://handbrake.fr/):

- Preset: **Web → Gmail Large 5 Min 720p**
- Eller bruk ffmpeg: `ffmpeg -i input.mp4 -vcodec h264 -crf 28 -preset slow -an cityscape.mp4`
  (`-an` fjerner lyd, som vi ikke trenger)

## Poster (valgfritt)

For å vise et stillbilde mens videoen laster, legg `images/cityscape-poster.jpg` (1920×1080).
