"""
tests/benchmark.py — Guardian System Performance Benchmark

Suites:
  --model   YOLOv8 validation metrics + per-frame inference speed
  --llm     Claude Haiku TTFT, total latency, throughput
  --tts     edge-tts generation latency per sentence
  --api     FastAPI HTTP endpoint latency + WebSocket connect time
  --all     Run everything (default when no flags given)

Usage:
  PYTHONPATH=. python3 tests/benchmark.py [--model] [--llm] [--tts] [--api] [--all]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import tempfile
import time
import urllib.error
import urllib.request

from dotenv import load_dotenv

load_dotenv()


# ── Pretty-print helpers ───────────────────────────────────────────────────

W = 54

def section(title: str) -> None:
    print(f"\n{'═' * W}")
    print(f"  {title}")
    print(f"{'═' * W}")

def row(label: str, value: str, unit: str = "") -> None:
    suffix = f" {unit}" if unit else ""
    print(f"  {label:<30}{value}{suffix}")

def subrow(label: str, value: str, unit: str = "") -> None:
    suffix = f" {unit}" if unit else ""
    print(f"    {label:<28}{value}{suffix}")

def ok(msg: str)   -> None: print(f"  ✓  {msg}")
def warn(msg: str) -> None: print(f"  ⚠  {msg}")
def err(msg: str)  -> None: print(f"  ✗  {msg}")


# ── 1. DETECTION MODEL ─────────────────────────────────────────────────────

def bench_model() -> None:
    section("1. DETECTION MODEL  (Roboflow inference SDK)")

    project = os.environ.get("ROBOFLOW_PROJECT")
    version = os.environ.get("ROBOFLOW_VERSION", "1")
    api_key = os.environ.get("ROBOFLOW_API_KEY")

    if not project or not api_key:
        err("ROBOFLOW_PROJECT / ROBOFLOW_API_KEY not set in .env — skipping"); return

    try:
        import numpy as np
        from inference import get_model
    except ImportError as e:
        err(f"Missing dependency: {e}"); return

    model_id = f"{project}/{version}"
    print(f"  Loading {model_id} …")
    model = get_model(model_id=model_id, api_key=api_key)
    ok("Model ready")

    # ── Inference speed (dummy 1280×720 frame) ──────────────────────
    # Note: each infer() call counts as one Roboflow credit.
    # We use 15 frames total (3 warm-up + 12 timed).
    print()
    print("  Measuring model inference speed — 12 frames …")
    dummy = np.zeros((720, 1280, 3), dtype=np.uint8)

    for _ in range(3):                          # warm-up
        model.infer(dummy, confidence=0.4)

    times: list[float] = []
    for _ in range(12):
        t0 = time.perf_counter()
        results = model.infer(dummy, confidence=0.4)
        times.append((time.perf_counter() - t0) * 1000)

    p95 = sorted(times)[int(len(times) * 0.95)]
    print()
    row("Model ID",        model_id)
    row("Inference mean",  f"{statistics.mean(times):.1f}", "ms / frame")
    row("Inference p95",   f"{p95:.1f}",                    "ms / frame")
    row("Inference min",   f"{min(times):.1f}",             "ms / frame")
    row("Throughput",      f"{1000 / statistics.mean(times):.1f}", "fps")

    # ── Detection summary on dummy frame ────────────────────────────
    preds = results[0].predictions if results else []
    row("Detections (blank frame)", str(len(preds)))


# ── 2. LLM ─────────────────────────────────────────────────────────────────

def bench_llm() -> None:
    section("2. LLM  (Claude Haiku)")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        err("ANTHROPIC_API_KEY not set — skipping"); return

    try:
        import anthropic
    except ImportError:
        err("anthropic not installed — skipping"); return

    client = anthropic.Anthropic(api_key=api_key)

    prompts = [
        "A person has fallen. What should I check first?",
        "The patient is unconscious and not breathing normally.",
        "How do I perform CPR on an adult?",
        "The person has a visible head injury and is confused.",
    ]

    system = (
        "You are an emergency medical voice assistant. "
        "Keep responses under 50 words. Plain sentences only, no markdown."
    )

    ttfts:       list[float] = []
    totals:      list[float] = []
    word_counts: list[int]   = []

    print()
    for i, prompt in enumerate(prompts):
        print(f"  [{i + 1}/{len(prompts)}] {prompt[:55]!r} …", flush=True)

        t_start          = time.perf_counter()
        first_token_time: float | None = None
        full_text        = ""

        with client.messages.stream(
            model      = "claude-haiku-4-5-20251001",
            max_tokens = 200,
            system     = system,
            messages   = [{"role": "user", "content": prompt}],
        ) as stream:
            for chunk in stream.text_stream:
                if first_token_time is None:
                    first_token_time = time.perf_counter()
                full_text += chunk

        t_end = time.perf_counter()

        ttft  = (first_token_time - t_start) * 1000 if first_token_time else 0.0
        total = (t_end - t_start) * 1000
        words = len(full_text.split())

        ttfts.append(ttft)
        totals.append(total)
        word_counts.append(words)

        print(f"       TTFT {ttft:.0f} ms  |  total {total:.0f} ms  |  {words} words")

    avg_wps = sum(word_counts) / sum(t / 1000 for t in totals)
    print()
    row("TTFT mean",          f"{statistics.mean(ttfts):.0f}",  "ms")
    row("TTFT min / max",     f"{min(ttfts):.0f} / {max(ttfts):.0f}", "ms")
    row("Total latency mean", f"{statistics.mean(totals):.0f}", "ms")
    row("Avg response",       f"{statistics.mean(word_counts):.0f}", "words")
    row("Throughput",         f"{avg_wps:.1f}", "words / s")


# ── 3. TTS ─────────────────────────────────────────────────────────────────

def bench_tts() -> None:
    section("3. TTS  (edge-tts / en-US-JennyNeural)")

    try:
        import edge_tts
    except ImportError:
        err("edge-tts not installed — skipping"); return

    sentences = [
        "Don't panic. Help is on the way.",
        "Check if they are conscious and breathing.",
        "A fall has been detected. The person may need immediate assistance.",
        "Please call emergency services immediately at nine nine nine.",
        "Check for any visible injuries before moving the patient.",
    ]

    voice = "en-US-JennyNeural"
    gen_times:  list[float] = []
    char_counts: list[int]  = []

    async def _gen(text: str, path: str) -> float:
        t0 = time.perf_counter()
        await edge_tts.Communicate(text, voice).save(path)
        return (time.perf_counter() - t0) * 1000

    print()
    with tempfile.TemporaryDirectory() as tmp:
        for i, sentence in enumerate(sentences):
            path = os.path.join(tmp, f"tts_{i}.mp3")
            print(f"  [{i + 1}/{len(sentences)}] ({len(sentence)} chars) …", end="  ", flush=True)

            ms      = asyncio.run(_gen(sentence, path))
            kb      = os.path.getsize(path) / 1024
            cps     = len(sentence) / (ms / 1000)

            gen_times.append(ms)
            char_counts.append(len(sentence))

            print(f"{ms:.0f} ms  |  {kb:.1f} KB  |  {cps:.0f} chars/s")

    total_chars = sum(char_counts)
    total_secs  = sum(gen_times) / 1000
    print()
    row("Generation mean",    f"{statistics.mean(gen_times):.0f}", "ms")
    row("Generation min",     f"{min(gen_times):.0f}",             "ms")
    row("Generation max",     f"{max(gen_times):.0f}",             "ms")
    row("Chars / s (overall)",f"{total_chars / total_secs:.0f}",   "chars / s")


# ── 4. DASHBOARD API ────────────────────────────────────────────────────────

def bench_api() -> None:
    section("4. DASHBOARD API  (FastAPI · localhost:8765)")

    base = "http://localhost:8765"
    N    = 10   # requests per endpoint

    def _get(path: str) -> float | None:
        try:
            t0 = time.perf_counter()
            with urllib.request.urlopen(f"{base}{path}", timeout=2):
                pass
            return (time.perf_counter() - t0) * 1000
        except Exception:
            return None

    # ── HTTP endpoints ──────────────────────────────────────────────
    endpoints = ["/health", "/config", "/call/status"]
    server_up = False
    print()

    for path in endpoints:
        times = [t for _ in range(N) if (t := _get(path)) is not None]

        if not times:
            row(f"GET {path}", "server not reachable"); continue

        server_up = True
        p95 = sorted(times)[int(len(times) * 0.95)]
        row(f"GET {path}", f"mean {statistics.mean(times):.1f} ms  p95 {p95:.1f} ms")

    # ── WebSocket connect time ──────────────────────────────────────
    if server_up:
        print()
        try:
            import websocket as _ws

            ws_times: list[float] = []
            for _ in range(5):
                t0 = time.perf_counter()
                ws = _ws.create_connection("ws://localhost:8765/ws", timeout=3)
                ws_times.append((time.perf_counter() - t0) * 1000)
                ws.close()

            row("WS connect mean", f"{statistics.mean(ws_times):.1f}", "ms")
            row("WS connect min",  f"{min(ws_times):.1f}",             "ms")

        except ImportError:
            warn("websocket-client not installed  →  pip install websocket-client")
        except Exception as e:
            warn(f"WebSocket test failed: {e}")
    else:
        warn("Server not running — start with:  PYTHONPATH=. python3 tests/test_video.py")


# ── MAIN ───────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Guardian system performance benchmark",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--model", action="store_true", help="Detection model (YOLO)")
    parser.add_argument("--llm",   action="store_true", help="LLM (Claude Haiku)")
    parser.add_argument("--tts",   action="store_true", help="TTS (edge-tts)")
    parser.add_argument("--api",   action="store_true", help="Dashboard API latency")
    parser.add_argument("--all",   action="store_true", help="Run all suites (default)")
    args = parser.parse_args()

    run_all = args.all or not any([args.model, args.llm, args.tts, args.api])

    print(f"\n{'═' * W}")
    print(f"  GUARDIAN BENCHMARK  —  {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'═' * W}")

    if run_all or args.model: bench_model()
    if run_all or args.llm:   bench_llm()
    if run_all or args.tts:   bench_tts()
    if run_all or args.api:   bench_api()

    print(f"\n{'═' * W}")
    print("  Done.")
    print(f"{'═' * W}\n")


if __name__ == "__main__":
    main()
