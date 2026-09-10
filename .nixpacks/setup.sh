#!/bin/bash
set -e

echo "Setting up corepack and pnpm..."
corepack enable
corepack prepare pnpm@9.0.0 --activate
echo "pnpm is now available"
pnpm --version
