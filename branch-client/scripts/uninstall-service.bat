@echo off
SET SERVICE_NAME=BranchClient
SC query %SERVICE_NAME% >nul 2>&1
IF %ERRORLEVEL% NEQ 0 ( echo [INFO] No instalado. & pause & exit /b 0 )
SC stop %SERVICE_NAME% >nul 2>&1 & timeout /t 3 /nobreak >nul
SC delete %SERVICE_NAME%
IF %ERRORLEVEL% == 0 ( echo [OK] Eliminado. ) ELSE ( echo [ERROR] Ejecuta como Administrador. )
pause
