"""
generate_icons.py — Run this once to create all PWA icon sizes.
Requires: pip install Pillow cairosvg
OR: pip install Pillow (uses built-in SVG drawing)
"""

import os, sys

ICONS_DIR = os.path.join(os.path.dirname(__file__), 'icons')
os.makedirs(ICONS_DIR, exist_ok=True)

SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

# ── Try cairosvg first (best quality) ────────────────
def try_cairosvg():
    try:
        import cairosvg
        SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
          <rect width="512" height="512" rx="100" fill="#4f7ef7"/>
          <rect x="60" y="160" width="280" height="200" rx="20" fill="white" opacity="0.95"/>
          <polygon points="360,185 460,140 460,365 360,320" fill="white" opacity="0.95"/>
          <circle cx="150" cy="255" r="35" fill="#4f7ef7"/>
          <circle cx="235" cy="255" r="35" fill="#6c5ce7"/>
        </svg>'''
        for size in SIZES:
            out = os.path.join(ICONS_DIR, f'icon-{size}.png')
            cairosvg.svg2png(bytestring=SVG.encode(), write_to=out,
                             output_width=size, output_height=size)
            print(f'  ✅ icon-{size}.png')
        return True
    except ImportError:
        return False

# ── Fallback: draw with Pillow ────────────────────────
def use_pillow():
    try:
        from PIL import Image, ImageDraw
        for size in SIZES:
            img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            d   = ImageDraw.Draw(img)
            r   = size // 5   # corner radius
            # Background rounded rect
            d.rounded_rectangle([0, 0, size-1, size-1], radius=r,
                                 fill=(79, 126, 247, 255))
            # Camera body
            m  = size // 8
            bw = int(size * 0.55)
            bh = int(size * 0.40)
            bx = m
            by = int(size * 0.30)
            d.rounded_rectangle([bx, by, bx+bw, by+bh], radius=size//20,
                                 fill=(255, 255, 255, 242))
            # Camera lens triangle
            tx = bx + bw + size // 20
            d.polygon([(tx, by + size//16),
                        (tx + size//4, by - size//16),
                        (tx + size//4, by + bh + size//16),
                        (tx, by + bh - size//16)],
                      fill=(255, 255, 255, 242))
            out = os.path.join(ICONS_DIR, f'icon-{size}.png')
            img.save(out, 'PNG')
            print(f'  ✅ icon-{size}.png')
        return True
    except ImportError:
        return False

print('\n📱 MeetPro — Generating PWA Icons\n')
if not try_cairosvg():
    print('  cairosvg not found, using Pillow fallback...')
    if not use_pillow():
        print('  ❌ Neither cairosvg nor Pillow found.')
        print('     Run: pip install Pillow')
        sys.exit(1)

print(f'\n✅ All icons saved to: {ICONS_DIR}')
print('   You can also replace these with your own logo.')
print('   Just keep the same filenames and sizes.\n')
