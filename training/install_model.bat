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
if errorlevel 1 goto NO_OLLAMA

set "DL=%USERPROFILE%\Downloads"
if not exist "weblume-lora.gguf" if exist "%DL%\weblume-lora.gguf" copy /y "%DL%\weblume-lora.gguf" . >nul
if not exist "Modelfile" if exist "Modelfile.txt" ren "Modelfile.txt" "Modelfile"
if not exist "Modelfile" if exist "%DL%\Modelfile" copy /y "%DL%\Modelfile" "Modelfile" >nul
if not exist "Modelfile" if exist "%DL%\Modelfile.txt" copy /y "%DL%\Modelfile.txt" "Modelfile" >nul
if not exist "weblume-lora.gguf" goto NO_LORA
if not exist "Modelfile" goto NO_MODELFILE

echo  [1/4] Allowing Weblume AI to talk to Ollama...
setx OLLAMA_ORIGINS "*" >nul
setx OLLAMA_CONTEXT_LENGTH "16384" >nul
set "OLLAMA_ORIGINS=*"
set "OLLAMA_CONTEXT_LENGTH=16384"
taskkill /f /im "ollama app.exe" >nul 2>nul
taskkill /f /im "ollama.exe" >nul 2>nul
timeout /t 2 >nul
start "" /min ollama serve
timeout /t 5 >nul

echo  [2/4] Downloading the base model qwen2.5-coder:7b - first time only, about 4.7 GB...
ollama pull qwen2.5-coder:7b
if errorlevel 1 goto PULL_FAIL

echo  [3/4] Creating the model weblume...
ollama create weblume -f Modelfile
if errorlevel 1 goto CREATE_FAIL

echo.
echo  [4/4] Done!  In Weblume AI: Settings - My device - choose model: weblume
echo        Chat with it here now, type /bye to exit:
echo.
ollama run weblume
pause
exit /b 0

:NO_OLLAMA
echo  [X] Ollama is not installed. Opening the download page...
echo      Install it, then run this file again.
start "" https://ollama.com/download/windows
pause
exit /b 1

:NO_LORA
echo  [X] weblume-lora.gguf not found.
echo      Put it in this folder or in Downloads:
echo      %~dp0
pause
exit /b 1

:NO_MODELFILE
echo  [X] Modelfile not found. Put it in this folder or in Downloads.
pause
exit /b 1

:PULL_FAIL
echo  [X] Download failed. Check your internet and run this file again.
pause
exit /b 1

:CREATE_FAIL
echo  [X] Something went wrong. Take a screenshot of this window and send it.
pause
exit /b 1
