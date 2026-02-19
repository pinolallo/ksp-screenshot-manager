#!/bin/bash
# Genera icone per Windows (.ico) e Linux (.png) dall'icona macOS (.icns)
# Richiede: imagemagick

echo "🎨 Generazione icone..."

# Estrai PNG da ICNS (macOS)
if [ -f "icon.icns" ]; then
    # Estrai la versione 512x512 dall'icns
    sips -s format png icon.icns --out icon_512.png --resampleHeightWidth 512 512 2>/dev/null || \
    iconutil -c iconset icon.icns 2>/dev/null

    # Genera icon.png per Linux (256x256)
    if command -v convert &> /dev/null; then
        convert icon_512.png -resize 256x256 icon.png
        echo "✅ icon.png creata (Linux)"

        # Genera icon.ico per Windows (multi-size)
        convert icon_512.png \
            \( -clone 0 -resize 256x256 \) \
            \( -clone 0 -resize 128x128 \) \
            \( -clone 0 -resize 64x64 \) \
            \( -clone 0 -resize 48x48 \) \
            \( -clone 0 -resize 32x32 \) \
            \( -clone 0 -resize 16x16 \) \
            -delete 0 icon.ico
        echo "✅ icon.ico creata (Windows)"
    else
        echo "⚠️  ImageMagick non trovato. Installa con: brew install imagemagick"
        echo "   Poi ri-esegui questo script dalla cartella build/"
    fi

    # Cleanup
    rm -f icon_512.png
else
    echo "❌ icon.icns non trovata nella cartella build/"
fi

echo "🏁 Fatto!"
