import os
import shutil
from pathlib import Path
from huggingface_hub import hf_hub_download, HfApi

DB_FILE = Path(__file__).parent.parent / "db" / "music_dashboard.db"

def download_db():
    """Download the SQLite database from the Hugging Face Dataset."""
    token = os.environ.get("HF_TOKEN")
    repo = os.environ.get("HF_DATASET_REPO")
    
    if not token or not repo:
        print("SYNC: HF_TOKEN or HF_DATASET_REPO not set. Skipping DB download.")
        return
        
    print(f"SYNC: Downloading database from dataset {repo}...")
    try:
        downloaded_path = hf_hub_download(
            repo_id=repo,
            repo_type="dataset",
            filename="music_dashboard.db",
            token=token,
            force_download=True
        )
        DB_FILE.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(downloaded_path, DB_FILE)
        print("SYNC: Database downloaded and replaced successfully.")
    except Exception as e:
        print(f"SYNC: Failed to download DB from dataset (this is normal if the dataset is newly created and empty): {e}")

def upload_db():
    """Upload the local SQLite database to the Hugging Face Dataset."""
    token = os.environ.get("HF_TOKEN")
    repo = os.environ.get("HF_DATASET_REPO")
    
    if not token or not repo:
        print("SYNC: HF_TOKEN or HF_DATASET_REPO not set. Skipping DB upload.")
        return
        
    if not DB_FILE.exists():
        print(f"SYNC: Database file {DB_FILE} does not exist. Skipping upload.")
        return
        
    print(f"SYNC: Uploading database to dataset {repo}...")
    try:
        api = HfApi()
        api.upload_file(
            path_or_fileobj=str(DB_FILE),
            path_in_repo="music_dashboard.db",
            repo_id=repo,
            repo_type="dataset",
            token=token,
            commit_message="Auto-sync daily dashboard database update"
        )
        print("SYNC: Database uploaded successfully.")
    except Exception as e:
        print(f"SYNC: Failed to upload DB to dataset: {e}")
