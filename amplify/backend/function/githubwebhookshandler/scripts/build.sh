#!/bin/bash

set -e

rm -rf ./src

echo "Compiling typescript files."
tsc -p ./tsconfig.json

echo "Copying package*.json files to the src folder."
cp package*.json src/

echo "Done!"
