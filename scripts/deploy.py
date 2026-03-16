#!/usr/bin/env python3
"""
Deploy Digital Twin to DigitalOcean droplet via SSH + SFTP.
Usage:  python3 scripts/deploy.py
Requires:  pip install paramiko
"""
import os
import sys
import tarfile
import io
import time
import paramiko
from pathlib import Path

HOST     = "143.198.228.58"
USER     = "root"
PASSWORD = "Wei2Shi4Lin2Twin"
APP_DIR  = "/opt/digital-twin"

# Files/dirs to upload (relative to project root)
INCLUDE = [
    "backend/app",
    "backend/requirements.txt",
    "frontend/src",
    "frontend/index.html",
    "frontend/package.json",
    "frontend/vite.config.js",
    "scripts/server_setup.sh",
    "config/professor_context.txt",
    ".env.example",
    ".env",
]

PROJECT_ROOT = Path(__file__).parent.parent


def ssh_run(ssh, cmd, check=True):
    print(f"  $ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out.strip():
        sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
        sys.stdout.buffer.flush()
    if err.strip():
        sys.stderr.buffer.write(err.encode("utf-8", errors="replace"))
        sys.stderr.buffer.flush()
    exit_code = stdout.channel.recv_exit_status()
    if check and exit_code != 0:
        raise RuntimeError(f"Command failed (exit {exit_code}): {cmd}")
    return out


def upload_files(sftp, ssh):
    """Create a tarball of project files and extract on server."""
    print("\n[2/4] Packaging project files…")
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for rel_path in INCLUDE:
            local = PROJECT_ROOT / rel_path
            if local.is_dir():
                for f in local.rglob("*"):
                    if f.is_file() and "__pycache__" not in str(f) and ".pyc" not in str(f):
                        arcname = str(f.relative_to(PROJECT_ROOT))
                        tar.add(str(f), arcname=arcname)
            elif local.is_file():
                tar.add(str(local), arcname=rel_path)
    buf.seek(0)
    size_kb = len(buf.getvalue()) // 1024
    print(f"  Archive size: {size_kb} KB")

    remote_tar = f"{APP_DIR}/deploy.tar.gz"
    sftp.putfo(buf, remote_tar)
    print(f"  Uploaded to {remote_tar}")
    ssh_run(ssh, f"cd {APP_DIR} && tar -xzf deploy.tar.gz && rm deploy.tar.gz")


def main():
    print(f"[1/4] Connecting to {HOST}…")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    print("  Connected.")

    # Create directory structure
    for d in ["backend/app", "frontend/src", "nginx", "scripts", "data/chroma", "data/notes", "logs"]:
        ssh_run(ssh, f"mkdir -p {APP_DIR}/{d}")

    upload_files(sftp, ssh)

    # .env is uploaded directly — no fallback copy needed

    print("\n[3/4] Running server setup…")
    ssh_run(ssh, f"chmod +x {APP_DIR}/scripts/server_setup.sh && bash {APP_DIR}/scripts/server_setup.sh")

    print("\n[4/4] Installing Python dependencies & building frontend…")
    ssh_run(ssh, f"{APP_DIR}/backend/venv/bin/pip install -r {APP_DIR}/backend/requirements.txt -q")
    ssh_run(ssh, f"cd {APP_DIR}/frontend && npm install --silent && npm run build")

    # (Re)start backend
    ssh_run(ssh, "systemctl restart digital-twin", check=False)
    time.sleep(3)
    out = ssh_run(ssh, "systemctl is-active digital-twin", check=False)
    status = out.strip()
    if "active" in status:
        print(f"\nBackend is {status}")
    else:
        print(f"\nWARNING: Backend status: {status}")
        print("   Check logs: tail -f /opt/digital-twin/logs/backend.log")

    ssh_run(ssh, "systemctl reload nginx || systemctl restart nginx", check=False)

    sftp.close()
    ssh.close()

    print(f"""
--- Digital Twin deployed! ---
  http://{HOST}
  API docs: http://{HOST}/api/docs
------------------------------
""")


if __name__ == "__main__":
    main()
