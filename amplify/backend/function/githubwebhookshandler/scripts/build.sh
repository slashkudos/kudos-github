#!/bin/bash

set -e

rm -rf ./src

echo "Compiling typescript files."
tsc -p ./tsconfig.json

echo "Copying package*.json files into the src folder."
cp package*.json src/

echo "Copying .npmrc into the src folder."
cp .npmrc src/

echo "Done."
