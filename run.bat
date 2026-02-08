@echo off
REM Run both backend and frontend. Double-click or: run.bat
REM Install root deps first: npm install

cd /d "%~dp0"
call npm run dev
