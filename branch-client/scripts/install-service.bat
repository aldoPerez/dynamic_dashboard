@echo off
SET SERVICE_NAME=BranchClient
SET EXE_PATH=%~dp0branch-client.exe
echo.
echo  Branch Client - Instalador de Servicio
echo  =======================================
echo.
IF NOT EXIST "%EXE_PATH%" ( echo [ERROR] No se encontro branch-client.exe & pause & exit /b 1 )
IF NOT EXIST "%~dp0config.json" ( echo [ERROR] No se encontro config.json & pause & exit /b 1 )
SC query %SERVICE_NAME% >nul 2>&1
IF %ERRORLEVEL% == 0 ( SC stop %SERVICE_NAME% >nul 2>&1 & timeout /t 3 /nobreak >nul & SC delete %SERVICE_NAME% >nul 2>&1 & timeout /t 2 /nobreak >nul )
SC create %SERVICE_NAME% binPath= "\"%EXE_PATH%\"" DisplayName= "Branch Client - Sync de Ventas" start= auto obj= LocalSystem
IF %ERRORLEVEL% NEQ 0 ( echo [ERROR] Ejecuta como Administrador. & pause & exit /b 1 )
SC description %SERVICE_NAME% "Sincroniza ventas en tiempo real con el servidor central"
SC failure %SERVICE_NAME% reset= 60 actions= restart/5000/restart/10000/restart/30000
SC start %SERVICE_NAME%
IF %ERRORLEVEL% NEQ 0 ( echo [WARN] Creado pero no pudo iniciarse. Revisa logs\. ) ELSE ( echo. & echo  [OK] Instalado correctamente. & echo  Logs: %~dp0logs\ )
echo.
pause
