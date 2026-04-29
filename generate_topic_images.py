#!/usr/bin/env python3
"""
Learning Routes — Generate topic card images via DALL-E 3
Run: python3 generate_topic_images.py
"""
import openai, requests, os, time

# Load API key from .env
with open(os.path.join(os.path.dirname(__file__), '.env')) as f:
    for line in f:
        if line.startswith('OPENAI_API_KEY='):
            API_KEY = line.strip().split('=', 1)[1]
            break

client = openai.OpenAI(api_key=API_KEY)
OUT = os.path.join(os.path.dirname(__file__), 'app', 'assets', 'images', 'topics')
os.makedirs(OUT, exist_ok=True)

topics = [
    ("programming", "Close-up of a developer's hands typing on a sleek mechanical keyboard, lines of glowing code reflected in their glasses, warm amber desk lamp lighting, shallow depth of field, cinematic editorial photography, premium quality, no text no watermarks"),
    ("web_development", "Modern minimalist workspace with ultrawide monitor showing colorful web interface with design system components, natural golden light from large window, plants on desk, editorial photography style, premium quality, no text no watermarks"),
    ("data_science", "Dramatic view of a modern desk with laptop showing data visualizations and charts, holographic-style data points floating, dark moody atmosphere with blue and green accent lighting, cinematic editorial style, no text no watermarks"),
    ("design", "Creative designer workspace from above, color swatches fanned out, Wacom drawing tablet, Figma interface on screen, scattered pencils and typography specimens, warm golden hour light, editorial overhead photography, no text no watermarks"),
    ("mobile_dev", "Close-up of a sleek smartphone displaying a beautiful gradient app interface, next to hand-drawn wireframe sketches on cream paper, soft diffused studio lighting, editorial product photography style, no text no watermarks"),
    ("business", "Modern glass-walled meeting room with a whiteboard covered in strategy diagrams and sticky notes, city skyline visible through floor-to-ceiling windows at golden hour, cinematic editorial photography, no text no watermarks"),
    ("languages", "Cozy vintage library corner with stacked books in different languages, handwritten notes in multiple scripts, warm reading lamp casting soft shadows, rich wood textures, editorial still life photography, no text no watermarks"),
    ("music", "Atmospheric recording studio with vintage analog synthesizer knobs in focus, headphones resting nearby, mixing board with warm glowing LED meters in background, moody cinematic lighting, editorial photography, no text no watermarks"),
]

print(f"\n🎨 Generating {len(topics)} images with DALL-E 3 HD (1792x1024)...\n")
for i, (name, prompt) in enumerate(topics):
    fp = os.path.join(OUT, f"{name}.png")
    print(f"[{i+1}/{len(topics)}] {name}...", end=" ", flush=True)
    try:
        r = client.images.generate(model="dall-e-3", prompt=prompt, size="1792x1024", quality="hd", n=1)
        img = requests.get(r.data[0].url, timeout=60).content
        with open(fp, "wb") as f: f.write(img)
        print(f"OK ({len(img)//1024} KB)")
    except Exception as e:
        print(f"ERROR: {e}")
    time.sleep(1)

print(f"\n✅ Done! Images in: {OUT}\n💰 Cost: ~$0.96 (8 × $0.12 DALL-E 3 HD)")
