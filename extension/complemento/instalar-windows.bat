@echo off
rem Instala o complemento do Talktrail (a pasta ao vivo em Documentos\Talktrail). Um clique, uma vez.
cd /d "%~dp0"
set "DEST=%LOCALAPPDATA%\Talktrail"
set "PY="
echo.
echo Instalando o complemento do Talktrail... / Installing the Talktrail add-on...
echo.

py -3 -c "import sys" >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if not defined PY (
  python -c "import sys" >nul 2>nul
  if not errorlevel 1 set "PY=python"
)

if not defined PY (
  echo Falta o Python 3 neste computador. Vou tentar instalar agora.
  echo Python 3 is missing on this computer. I will try to install it now.
  where winget >nul 2>nul
  if not errorlevel 1 (
    winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    py -3 -c "import sys" >nul 2>nul
    if not errorlevel 1 set "PY=py -3"
  )
)

if not defined PY (
  echo.
  echo Nao consegui instalar sozinho. Vou abrir a pagina do Python.
  echo Instale marcando "Add python.exe to PATH" e abra este arquivo de novo.
  echo I could not install it by myself. I will open the Python page.
  echo Install it with "Add python.exe to PATH" checked and open this file again.
  start "" "https://www.python.org/downloads/"
  pause
  exit /b 1
)

if not exist "%DEST%" mkdir "%DEST%"
copy /y talktrail_server.py "%DEST%\talktrail_server.py" >nul
%PY% "%DEST%\talktrail_server.py" --instalar
echo.
echo Pronto. Volte pro navegador: o Talktrail ja salva em Documentos\Talktrail.
echo Done. Go back to your browser: Talktrail now saves to Documents\Talktrail.
pause
