import os
from pathlib import Path
from dotenv import load_dotenv
from roboflow import Roboflow

load_dotenv()

api_key   = os.environ["ROBOFLOW_API_KEY"]
workspace = os.environ["ROBOFLOW_WORKSPACE"]
project   = os.environ["ROBOFLOW_PROJECT"]
version   = int(os.environ["ROBOFLOW_VERSION"])

print(f"Connecting to Roboflow...")
print(f"Workspace: {workspace}")
print(f"Project:   {project}")
print(f"Version:   {version}")

rf      = Roboflow(api_key=api_key)
proj    = rf.workspace(workspace).project(project)
ver     = proj.version(version)

print(f"\nDownloading dataset...")

dataset = ver.download(
    model_format="yolov11",
    location="data/dataset",
    overwrite=True,
)

print(f"\n✅ Done!")
print(f"   Location: data/dataset")
print(f"   Classes:  {ver.classes}")

for split in ["train", "valid", "test"]:
    imgs = list(Path(f"data/dataset/{split}/images").glob("*.*"))
    print(f"   {split:6s}: {len(imgs)} images")
