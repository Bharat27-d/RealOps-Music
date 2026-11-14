@echo off
title RealOps Music Launcher
echo ===================================================
echo           Starting RealOps Music System
echo ===================================================

echo [1/2] Starting Lavalink v4 Audio Engine...
start "Lavalink v4 Audio Engine" cmd /k "cd lavalink && java -jar Lavalink.jar"

echo [2/2] Waiting 7 seconds for Lavalink to be ready...
timeout /t 7 /nobreak >nul

echo Starting Discord Music Bot...
start "RealOps Music Bot" cmd /k "npm start"

echo ===================================================
echo  Both services launched in separate windows!
echo  Keep both windows open while playing music.
echo ===================================================

