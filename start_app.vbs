Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)

' Run start-hidden.vbs to ensure server & tunnel are running
TunnelDir = ScriptDir & "\tunnel"
WshShell.CurrentDirectory = TunnelDir
WshShell.Run Chr(34) & TunnelDir & "\start-hidden.vbs" & Chr(34), 0, False

' Open domain in browser
WScript.Sleep 2000
WshShell.Run "https://sdl.sohardental.com"
