"""Render the App's authored geometric film/play mark for native shells."""
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1]
directory = root / "assets"
directory.mkdir(exist_ok=True)
image = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((32, 32, 992, 992), radius=208, fill="#103D37")
draw.rounded_rectangle((168, 226, 856, 798), radius=48, fill="#F0EFE8")
for y in (288, 410, 532, 654):
    draw.rounded_rectangle((204, y, 256, y+70), radius=10, fill="#103D37")
    draw.rounded_rectangle((768, y, 820, y+70), radius=10, fill="#103D37")
draw.polygon(((390, 346), (390, 678), (660, 512)), fill="#CE492D")
image.resize((512, 512), Image.Resampling.LANCZOS).save(directory / "app-icon.png")
image.save(directory / "app-icon.ico", sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
