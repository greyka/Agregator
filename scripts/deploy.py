"""Deploy Agregator to a remote SBC via SSH (paramiko).

Usage:
  set DEPLOY_PASSWORD=...
  python scripts/deploy.py --host 192.168.1.100 --user umbrel --path /home/umbrel/agregator

The password is read from the DEPLOY_PASSWORD environment variable, never from CLI args,
so it doesn't leak into shell history.
"""
from __future__ import annotations

import argparse
import io
import os
import sys
import tarfile
import time
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("paramiko not installed. Run: pip install paramiko", file=sys.stderr)
    sys.exit(1)


EXCLUDE_DIRS = {"node_modules", "__pycache__", ".git", "dist", ".venv", ".idea", ".vscode"}
EXCLUDE_SUFFIX = (".pyc", ".pyo", ".db", ".log")


def make_tarball(root: Path) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for p in root.rglob("*"):
            rel = p.relative_to(root)
            if any(part in EXCLUDE_DIRS for part in rel.parts):
                continue
            if p.is_file() and p.suffix in EXCLUDE_SUFFIX:
                continue
            if p.is_file():
                tar.add(p, arcname=str(rel).replace("\\", "/"))
    return buf.getvalue()


def run(client: paramiko.SSHClient, cmd: str, *, check: bool = True, stream: bool = True,
        sudo_password: str | None = None) -> tuple[int, str, str]:
    print(f"\n-> {cmd}")
    transport = client.get_transport()
    chan = transport.open_session()
    chan.exec_command(cmd)
    if sudo_password is not None:
        chan.send(sudo_password + "\n")
    out_buf, err_buf = [], []

    while True:
        if chan.recv_ready():
            chunk = chan.recv(65536).decode(errors="replace")
            out_buf.append(chunk)
            if stream:
                sys.stdout.write(chunk)
                sys.stdout.flush()
        if chan.recv_stderr_ready():
            chunk = chan.recv_stderr(65536).decode(errors="replace")
            err_buf.append(chunk)
            if stream:
                sys.stderr.write(chunk)
                sys.stderr.flush()
        if chan.exit_status_ready() and not chan.recv_ready() and not chan.recv_stderr_ready():
            break
        time.sleep(0.05)

    rc = chan.recv_exit_status()
    out = "".join(out_buf)
    err = "".join(err_buf)
    if check and rc != 0:
        raise RuntimeError(f"Remote command failed (rc={rc}): {cmd}\n{err}")
    return rc, out, err


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--user", default="umbrel")
    parser.add_argument("--port", type=int, default=22)
    parser.add_argument("--path", default="/home/umbrel/agregator")
    parser.add_argument("--no-build", action="store_true")
    args = parser.parse_args()

    password = os.environ.get("DEPLOY_PASSWORD")
    if not password:
        print("ERROR: set DEPLOY_PASSWORD env var with the SSH password", file=sys.stderr)
        return 2

    project_root = Path(__file__).resolve().parent.parent
    print(f"Project root: {project_root}")
    print(f"Target: {args.user}@{args.host}:{args.port} -> {args.path}")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    print("\n[1/5] Connecting via SSH...")
    client.connect(args.host, port=args.port, username=args.user,
                   password=password, allow_agent=False, look_for_keys=False,
                   timeout=15)

    print("\n[2/5] Checking system & Docker...")
    run(client, "uname -a && cat /etc/os-release | head -3 && docker --version && docker compose version")

    print("\n[3/5] Preparing remote dir...")
    # Detect docker permissions first so we know whether to sudo subsequent commands.
    # (Backend container writes .pyc as root in mounted volumes; only sudo can clear them.)
    rc, _, _ = run(client, "docker ps >/dev/null 2>&1", check=False, stream=False)
    needs_sudo = rc != 0
    sudo_prefix = "sudo -S -p '' " if needs_sudo else ""
    if needs_sudo:
        print("  (user not in docker group — will use sudo for docker + cleanup)")

    # Wipe project source files so files removed locally are gone remote too.
    # Keeps the directory itself, the deploy tarball, and docker volumes intact.
    run(client, (
        f"mkdir -p {args.path} && "
        f"{sudo_prefix}find {args.path} -mindepth 1 -maxdepth 1 "
        f"! -name '_deploy.tar.gz' ! -name '.env' "
        f"-exec rm -rf {{}} +"
    ), sudo_password=password if needs_sudo else None)

    print("\n[4/5] Packing project and uploading...")
    tarball = make_tarball(project_root)
    print(f"  tarball size: {len(tarball) / 1024:.1f} KiB")

    sftp = client.open_sftp()
    remote_tar = f"{args.path}/_deploy.tar.gz"
    with sftp.file(remote_tar, "wb") as f:
        f.write(tarball)
    sftp.close()
    print(f"  uploaded to {remote_tar}")

    run(client, f"cd {args.path} && tar -xzf _deploy.tar.gz && rm _deploy.tar.gz && ls -la")

    if args.no_build:
        print("\n[5/5] Skipping build (--no-build)")
    else:
        print("\n[5/5] Building & starting docker compose (this may take a few minutes)...")
        run(client, f"cd {args.path} && {sudo_prefix}docker compose up -d --build",
            sudo_password=password if needs_sudo else None)

        print("\n[verify] Checking backend...")
        time.sleep(4)
        rc, _, _ = run(client, "curl -fsS http://localhost:8000/ && echo", check=False)
        if rc != 0:
            print("\n!! Backend not responding yet, dumping logs:")
            run(client, f"cd {args.path} && {sudo_prefix}docker compose ps && {sudo_prefix}docker compose logs --tail=80 backend",
                check=False, sudo_password=password if needs_sudo else None)
        else:
            print("\n[OK] Backend reachable.")

    print("\n========================================")
    print(f"  UI:  http://{args.host}:5173")
    print(f"  API: http://{args.host}:8000/docs")
    print("========================================\n")

    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
