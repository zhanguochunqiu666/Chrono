@echo off
setlocal
cd /d "%~dp0"
title Chrono
echo.
echo  Chrono is starting. Your browser will open in a moment.
echo  Close this window to stop it.
echo.

where node >nul 2>nul
if %errorlevel%==0 goto usenode
where python >nul 2>nul
if %errorlevel%==0 goto usepython
where py >nul 2>nul
if %errorlevel%==0 goto usepy
goto nothing

:usenode
start /b cmd /c "ping -n 3 127.0.0.1 >nul && start http://localhost:8765"
node tools\server.js 8765
goto end

:usepython
start /b cmd /c "ping -n 3 127.0.0.1 >nul && start http://localhost:8765"
python tools\server.py 8765
goto end

:usepy
start /b cmd /c "ping -n 3 127.0.0.1 >nul && start http://localhost:8765"
py tools\server.py 8765
goto end

:nothing
echo  Neither Node.js nor Python was found.
echo  Please double-click the single-file .html in this folder instead,
echo  or install Node.js from https://nodejs.org
pause

:end
endlocal
