#!/bin/bash

#run this script AFTER moving this to the current directory and prevous install is in the 'previous' directory

mv ../bootstrap/configClient.json ../configClient.json.orig
mv ../*.json ../*.json.orig

cp ../../previous/*.json ../
cp ../../previous/bootstrap/configClient.json ../bootstrap/configClient.json

echo "moved renamed original files and copied previous versions"
