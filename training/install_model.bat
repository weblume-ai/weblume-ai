@echo off
chcp 65001 >nul
title Weblume Model Installer
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

if not exist "model.gguf" (
  for %%F in ("%~dp0*.gguf") do if not exist "model.gguf" ren "%%F" "model.gguf"
)
if not exist "model.gguf" (
  echo  [X] model.gguf not found.
  echo      Put model.gguf from Colab / Google Drive in this folder:
  echo      %~dp0
  pause
  exit /b 1
)
if not exist "Modelfile" (
  echo  [X] Modelfile not found in this folder.
  pause
  exit /b 1
)

echo  [1/3] Allowing Weblume AI to talk to Ollama...
setx OLLAMA_ORIGINS "*" >nul
setx OLLAMA_CONTEXT_LENGTH "16384" >nul
set OLLAMA_ORIGINS=*
set OLLAMA_CONTEXT_LENGTH=16384
taskkill /f /im "ollama app.exe" >nul 2>nul
taskkill /f /im "ollama.exe" >nul 2>nul
timeout /t 2 >nul
start "" /min ollama serve
timeout /t 4 >nul

echo  [2/3] Creating the model "weblume" (takes a minute)...
ollama create weblume -f Modelfile
if errorlevel 1 (
  echo  [X] Something went wrong. Take a screenshot of this window and send it.
  pause
  exit /b 1
)

echo.
echo  [3/3] Done!  In Weblume AI: Settings - "جهازي" - choose model: weblume
echo        Chat with it here now (type /bye to exit):
echo.
ollama run weblume
