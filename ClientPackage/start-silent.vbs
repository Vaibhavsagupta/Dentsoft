' ==========================================================
' Dental Lab Enterprise System - Silent Auto-Runner
' Launches Backend API & Cloudflare Tunnel in background (No CMD windows)
' ==========================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strCurrentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strCurrentDir

' 1. Start Cloudflare Tunnel silently (0 = hide window)
WshShell.Run "cmd /c """ & strCurrentDir & "\cloudflared.exe"" --config """ & strCurrentDir & "\cloudflare-config.yml"" tunnel run", 0, False

' 2. Wait 1 second before starting API server
WScript.Sleep 1000

' 3. Start Backend Server executable silently
WshShell.Run "cmd /c """ & strCurrentDir & "\server.exe""", 0, False
