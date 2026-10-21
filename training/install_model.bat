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
if not exist "weblume.gguf" if not exist "weblume-lora.gguf" goto NO_LORA
if not exist "Modelfile.merged" goto NO_MODELFILE

echo  [1/5] Allowing Weblume AI to talk to Ollama...
setx OLLAMA_ORIGINS "*" >nul
setx OLLAMA_CONTEXT_LENGTH "16384" >nul
set "OLLAMA_ORIGINS=*"
set "OLLAMA_CONTEXT_LENGTH=16384"
ollama list >nul 2>nul
if not errorlevel 1 goto SERVER_OK
start "" /min ollama serve
timeout /t 5 >nul
:SERVER_OK

if exist "weblume.gguf" goto CREATE

echo  [2/5] Making sure the base model qwen2.5-coder:7b is downloaded...
ollama pull qwen2.5-coder:7b
if errorlevel 1 goto PULL_FAIL

set "BASEFILE="
for %%F in ("%USERPROFILE%\.ollama\models\blobs\sha256-60e05f210007*") do set "BASEFILE=%%~fF"
if not defined BASEFILE for /f "tokens=1,*" %%A in ('ollama show qwen2.5-coder:7b --modelfile ^| findstr /b "FROM"') do set "BASEFILE=%%B"
if not defined BASEFILE goto NO_BASE
if not exist "%BASEFILE%" goto NO_BASE
echo        base: %BASEFILE%

set "EXPORT=%~dp0tools\llama-export-lora.exe"
set "QUANT=%~dp0tools\llama-quantize.exe"
if not exist "%EXPORT%" set "EXPORT="
if not exist "%QUANT%" set "QUANT="
if not defined EXPORT goto TOOLS_FAIL
if not defined QUANT goto TOOLS_FAIL

echo  [3/5] Merging your training into the model - a few minutes, needs ~16 GB free disk...
"%EXPORT%" -m "%BASEFILE%" --lora weblume-lora.gguf -o weblume-f16.gguf -t 8
if errorlevel 1 goto MERGE_FAIL
if not exist "weblume-f16.gguf" goto MERGE_FAIL

echo  [4/5] Shrinking it back to ~4.7 GB - a few minutes...
"%QUANT%" --allow-requantize weblume-f16.gguf weblume.gguf Q4_K_M 8
if errorlevel 1 goto MERGE_FAIL
if not exist "weblume.gguf" goto MERGE_FAIL
del weblume-f16.gguf

:CREATE
echo  [5/5] Creating the model weblume in Ollama...
ollama create weblume -f Modelfile.merged
if errorlevel 1 goto CREATE_FAIL

echo.
echo  Done!  In Weblume AI: Settings - My device - choose model: weblume
echo  Chat with it here now, type /bye to exit:
echo.
ollama run weblume
pause
exit /b 0

:NO_OLLAMA
echo  [X] Ollama is not installed. Opening the download page...
start "" https://ollama.com/download/windows
pause
exit /b 1
:NO_LORA
echo  [X] weblume-lora.gguf not found. Put it in this folder or in Downloads.
pause
exit /b 1
:NO_MODELFILE
echo  [X] Modelfile.merged not found in this folder.
pause
exit /b 1
:PULL_FAIL
echo  [X] Download failed. Check your internet and run this file again.
pause
exit /b 1
:NO_BASE
echo  [X] Could not find the downloaded qwen2.5-coder:7b file. Take a screenshot and send it.
pause
exit /b 1
:TOOLS_FAIL
echo  [X] The tools folder is missing. Extract the whole zip, then run this file again.
pause
exit /b 1
:MERGE_FAIL
echo  [X] Merging failed. Take a screenshot of this window and send it.
pause
exit /b 1
:CREATE_FAIL
echo  [X] Something went wrong. Take a screenshot of this window and send it.
pause
exit /b 1
