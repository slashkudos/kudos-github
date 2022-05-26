#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
ROOT_DIR=$SCRIPT_DIR/..

amplify_env=$1
amplify_appId=$2

if [ -z "$amplify_env" ]; then
    echo "You must provide amplify_env input parameter in order to deploy"
    exit 1
fi

if [ -z "$amplify_appId" ]; then
    echo "You must provide amplify_appId input parameter in order to deploy"
    exit 1
fi

if [ -z "$(amplify env get --name $amplify_env | grep 'No environment found')" ]; then
    echo "Pulling $amplify_env ($amplify_appId)"
    rm -rf $ROOT_DIR/amplify-temp
    cp -r $ROOT_DIR/amplify $ROOT_DIR/amplify-temp

    amplify pull --appId $amplify_appId --envName $amplify_env --yes

    rm -rf $ROOT_DIR/amplify/backend/api/*
    rm -rf $ROOT_DIR/amplify/backend/auth/*
    rm -rf $ROOT_DIR/amplify/backend/function/*
    rm -rf $ROOT_DIR/amplify/backend/types/*

    cp -r $ROOT_DIR/amplify-temp/* $ROOT_DIR/amplify
    rm -rf $ROOT_DIR/amplify-temp

    # GraphQL transformer version 2 outputs GraphQL API Key even with "CreateAPIKey": 0
    amplify status -v | grep -v "GraphQL API KEY"

    status=$?
    exit $status
else
    echo "$amplify_env environment does not exist"
    exit 1
fi
