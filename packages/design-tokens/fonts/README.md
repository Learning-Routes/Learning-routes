# Fonts

`Archivo-latin.woff2` and `DMMono-*-latin.woff2` are what the site loads: the full fonts in this folder, cut to Latin for the five locales (es, en, pt, fr, it) and, for Archivo, to weights 400 to 800 and widths 100 to 125. To make them again, with `fonttools` and `brotli` from pip:

```sh
U="U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+2013-2014,U+2018-201D,U+2022,U+2026,U+20AC"
fonttools varLib.instancer "Archivo[wdth,wght].ttf" wght=400:800 wdth=100:125 -o archivo-limited.ttf
pyftsubset archivo-limited.ttf --unicodes="$U" --flavor=woff2 --layout-features='kern,liga,tnum,lnum,ccmp,locl,mark,mkmk' --output-file=Archivo-latin.woff2
pyftsubset DMMono-Regular.ttf --unicodes="$U" --flavor=woff2 --layout-features='kern,liga,ccmp,locl,mark,mkmk' --output-file=DMMono-Regular-latin.woff2
pyftsubset DMMono-Medium.ttf --unicodes="$U" --flavor=woff2 --layout-features='kern,liga,ccmp,locl,mark,mkmk' --output-file=DMMono-Medium-latin.woff2
```
