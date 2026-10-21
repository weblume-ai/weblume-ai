@echo off
chcp 65001 >nul
title Weblume Coder Installer
cd /d "%~dp0"
echo.
echo  ===========================================
echo     Weblume Coder - install your website AI
echo  ===========================================
echo.

where ollama >nul 2>nul
if errorlevel 1 (
  echo  [X] Ollama is not installed.
  echo      Opening the download page... install it, then run this file again.
  start "" https://ollama.com/download/windows
  pause
  exit /b 1
)
if not exist "weblume-lora.gguf" (
  echo  [X] weblume-lora.gguf not found.
  echo      Download it from Google Drive - folder weblume_model - into:
  echo      %~dp0
  pause
  exit /b 1
)
if not exist "Modelfile" (
  echo  [X] Modelfile not found in this folder.
  pause
  exit /b 1
)

echo  [1/4] Allowing Weblume AI to talk to Ollama...
setx OLLAMA_ORIGINS "*" >nul
setx OLLAMA_CONTEXT_LENGTH "16384" >nul
set OLLAMA_ORIGINS=*
set OLLAMA_CONTEXT_LENGTH=16384
taskkill /f /im "ollama app.exe" >nul 2>nul
taskkill /f /im "ollama.exe" >nul 2>nul
timeout /t 2 >nul
start "" /min ollama serve
timeout /t 4 >nul

echo  [2/4] Downloading the base model qwen2.5-coder:7b (first time only, about 4.7 GB)...
for /f "tokens=2" %%B in ('findstr /b "FROM" Modelfile') do set BASE=%%B
ollama pull %BASE%
if errorlevel 1 (
  echo  [X] Download failed. Check your internet and run this file again.
  pause
  exit /b 1
)

echo  [3/4] Creating the model "weblume"...
ollama create weblume -f Modelfile
if errorlevel 1 (
  echo  [X] Something went wrong. Take a screenshot of this window and send it.
  pause
  exit /b 1
)

echo.
echo  [4/4] Done!  In Weblume AI: Settings - "جهازي" - choose model: weblume
echo        Chat with it here now (type /bye to exit):
echo.
ollama run weblume
