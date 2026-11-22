import argparse
import getpass
import hashlib
import secrets

from .auth import password_hash
from .db import connect, init_db


def main():
    parser = argparse.ArgumentParser(description="Manage Senandika Sunyi accounts and partner access")
    commands = parser.add_subparsers(dest="command", required=True)
    user = commands.add_parser("user")
    user.add_argument("username")
    user.add_argument("role", choices=["visitor", "curator", "reviewer"])
    for command in ("partner-key", "revoke-key"):
        commands.add_parser(command).add_argument("name")
    args = parser.parse_args()

    init_db()
    if args.command == "user":
        password = getpass.getpass("Password: ")
        if not 12 <= len(password) <= 128:
            parser.error("Password must contain 12 to 128 characters")
        if not 3 <= len(args.username) <= 64 or args.username.strip() != args.username:
            parser.error("Username must contain 3 to 64 characters without surrounding spaces")
        digest = password_hash.hash(password)
        with connect(write=True) as db:
            db.execute(
                """INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)
                   ON CONFLICT(username) DO UPDATE SET
                   password_hash = excluded.password_hash, role = excluded.role""",
                (args.username, digest, args.role),
            )
    elif args.command == "partner-key":
        key = secrets.token_urlsafe(32)
        digest = hashlib.sha256(key.encode()).hexdigest()
        with connect(write=True) as db:
            db.execute(
                """INSERT INTO partner_keys (name, key_hash) VALUES (?, ?)
                   ON CONFLICT(name) DO UPDATE SET key_hash = excluded.key_hash""",
                (args.name, digest),
            )
        print(key)
    else:
        with connect(write=True) as db:
            db.execute("DELETE FROM partner_keys WHERE name = ?", (args.name,))


if __name__ == "__main__":
    main()
