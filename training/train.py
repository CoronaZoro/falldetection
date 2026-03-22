import torch
import shutil
from pathlib import Path
from datetime import datetime
from ultralytics import YOLO

DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"Device: {DEVICE}")

DATA_YAML = "data/dataset/data.yaml"

model    = YOLO("yolo11n.pt")
run_name = f"fall_{datetime.now().strftime('%Y%m%d_%H%M')}"

print(f"Starting training: {run_name}")
print(f"Classes: bending, down, up\n")

results = model.train(
    data    = DATA_YAML,
    epochs  = 100,
    imgsz   = 640,
    batch   = 16,
    device  = DEVICE,
    project = "training/runs",
    name    = run_name,

    # Optimizer
    optimizer     = "AdamW",
    lr0           = 0.001,
    warmup_epochs = 5,
    patience      = 20,

    # Augmentation
    hsv_v    = 0.4,
    fliplr   = 0.5,
    degrees  = 10,
    scale    = 0.4,
    mosaic   = 1.0,
    mixup    = 0.15,
    flipud   = 0.0,

    save_period = 10,
    val         = True,
)

# Save best weights
best = Path(f"training/runs/{run_name}/weights/best.pt")
dest = Path("models/best.pt")
dest.parent.mkdir(exist_ok=True)
shutil.copy(best, dest)

mAP = results.results_dict.get("metrics/mAP50(B)", 0)
print(f"\n✅ Training complete!")
print(f"   mAP50:   {mAP:.3f}")
print(f"   Weights: models/best.pt")

if mAP > 0.70:
    print(f"   ✅ Good result — ready for testing!")
else:
    print(f"   ⚠️  Below 0.70 — may need more data")
