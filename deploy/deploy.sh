#!/usr/bin/env bash
# Builds ah-mcp and installs it on a server, for the first install and every update.
#
# Usage: AH_DEPLOY_HOST=user@server ./deploy/deploy.sh
#
# Needs SSH access as a user with sudo, and on the server: Node.js 24+, the
# ah-mcp user, and /home/ah-mcp/.env (see "Deploying to a server" in README.md).

set -euo pipefail

HOST="${AH_DEPLOY_HOST:?set AH_DEPLOY_HOST, e.g. AH_DEPLOY_HOST=user@server}"

cd "$(dirname "$0")/.."

echo "Building..."
npm ci
npm run build
PACKAGE=$(npm pack --silent)

echo "Copying to $HOST..."
# A private directory: files in a shared /tmp could be swapped before sudo installs them.
REMOTE_DIR=$(ssh "$HOST" mktemp -d)
scp "$PACKAGE" deploy/ah-mcp.service "$HOST:$REMOTE_DIR/"
rm "$PACKAGE"

echo "Installing and restarting..."
ssh -t "$HOST" "
  set -e
  trap 'rm -rf $REMOTE_DIR' EXIT
  sudo npm install --global --prefix /usr/local $REMOTE_DIR/$PACKAGE
  sudo install -m 644 -o root -g root $REMOTE_DIR/ah-mcp.service /etc/systemd/system/ah-mcp.service
  sudo systemctl daemon-reload
  sudo systemctl enable ah-mcp
  sudo systemctl restart ah-mcp
  /usr/local/bin/ah-mcp --version
  systemctl --no-pager --lines=5 status ah-mcp
"

echo "Done."
