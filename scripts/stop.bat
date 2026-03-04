@echo off
setlocal

set SCRIPT_DIR=%~dp0
pushd "%SCRIPT_DIR%.."

docker compose down --remove-orphans

popd
endlocal
