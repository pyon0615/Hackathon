import os
import time
from pathlib import Path

import polars as pl
import requests
from huggingface_hub import list_dataset_parquet_files

HF_TOKEN = os.environ["HF_TOKEN"]
REPO_ID = "foursquare/fsq-os-places"

OUT_DIR = Path("data")
TMP_DIR = OUT_DIR / "tmp"
PARTS_DIR = OUT_DIR / "parts"
OUT_FILE = OUT_DIR / "sydney_places.parquet"

TMP_DIR.mkdir(parents=True, exist_ok=True)
PARTS_DIR.mkdir(parents=True, exist_ok=True)

SYDNEY_BBOX = {
    "min_lat": -34.20,
    "max_lat": -33.20,
    "min_lng": 150.50,
    "max_lng": 151.40,
}


def download_with_backoff(url: str, dest: Path, session: requests.Session) -> None:
    headers = {"Authorization": f"Bearer {HF_TOKEN}"}

    for attempt in range(1, 11):
        print(f"  Download attempt {attempt}: {url}", flush=True)

        with session.get(url, headers=headers, stream=True, timeout=120) as r:
            if r.status_code == 429:
                retry_after = r.headers.get("Retry-After")
                wait_s = int(retry_after) if retry_after and retry_after.isdigit() else 60
                print(f"  Hit 429 rate limit. Waiting {wait_s} seconds...", flush=True)
                time.sleep(wait_s)
                continue

            r.raise_for_status()

            with open(dest, "wb") as f:
                for chunk in r.iter_content(chunk_size=8 * 1024 * 1024):
                    if chunk:
                        f.write(chunk)

            return

    raise RuntimeError(f"Failed to download after retries: {url}")


def process_local_parquet(src_file: Path, out_part_file: Path) -> int:
    df = (
        pl.scan_parquet(str(src_file))
        .select(
            [
                "fsq_place_id",
                "name",
                "latitude",
                "longitude",
                "address",
                "locality",
                "region",
                "postcode",
                "country",
                "date_created",
                "date_closed",
                "fsq_category_labels",
            ]
        )
        .filter(
            (pl.col("country") == "AU")
            & pl.col("latitude").is_between(SYDNEY_BBOX["min_lat"], SYDNEY_BBOX["max_lat"], closed="both")
            & pl.col("longitude").is_between(SYDNEY_BBOX["min_lng"], SYDNEY_BBOX["max_lng"], closed="both")
            # Keep ALL records (active + closed) for survival rate computation
        )
        .with_columns(
            pl.when(pl.col("fsq_category_labels").is_null())
            .then(pl.lit(""))
            .otherwise(pl.col("fsq_category_labels").list.join(" | "))
            .alias("category_text")
        )
        .select(
            [
                "fsq_place_id",
                "name",
                "latitude",
                "longitude",
                "address",
                "locality",
                "region",
                "postcode",
                "country",
                "date_created",
                "date_closed",
                "category_text",
            ]
        )
        .collect()
    )

    rows = df.height

    if rows > 0:
        df.write_parquet(out_part_file, compression="zstd")

    return rows


def main():
    print("Listing parquet files from Hugging Face...", flush=True)
    entries = list_dataset_parquet_files(REPO_ID, token=HF_TOKEN)

    place_entries = [e for e in entries if e.config == "places" and e.split == "train"]

    if not place_entries:
        raise RuntimeError("No parquet shards found for config='places', split='train'")

    print(f"Found {len(place_entries)} parquet shards", flush=True)

    session = requests.Session()
    total_rows = 0

    for i, entry in enumerate(place_entries, start=1):
        tmp_file = TMP_DIR / f"places_{i:04d}.parquet"
        part_file = PARTS_DIR / f"sydney_{i:04d}.parquet"

        if part_file.exists():
            print(f"[{i}/{len(place_entries)}] Skipping already processed shard", flush=True)
            continue

        print(f"\n[{i}/{len(place_entries)}] Processing shard", flush=True)
        print(f"URL: {entry.url}", flush=True)

        download_with_backoff(entry.url, tmp_file, session)

        print("  Filtering locally...", flush=True)
        rows = process_local_parquet(tmp_file, part_file)
        total_rows += rows
        print(f"  Sydney matches in this shard: {rows}", flush=True)

        if tmp_file.exists():
            tmp_file.unlink()

        time.sleep(2)

    part_files = sorted(PARTS_DIR.glob("sydney_*.parquet"))
    if not part_files:
        raise RuntimeError("No Sydney rows were found. Final file not created.")

    print("\nMerging all Sydney part files...", flush=True)
    pl.scan_parquet([str(p) for p in part_files]).sink_parquet(str(OUT_FILE), compression="zstd")

    final_rows = (
        pl.scan_parquet(str(OUT_FILE))
        .select(pl.len().alias("rows"))
        .collect()
        .item()
    )

    print(f"\nDone. Final output: {OUT_FILE}", flush=True)
    print(f"Total rows in final Sydney file: {final_rows:,}", flush=True)


if __name__ == "__main__":
    main()