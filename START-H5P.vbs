Option Explicit
Dim shell, fso, root, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
If Not fso.FileExists(root & "\runtime\node.exe") Then
  MsgBox "The bundled Node runtime is missing. Restore the complete H5P Desktop Viewer folder.", 16, "H5P Desktop Viewer"
  WScript.Quit 1
End If
shell.CurrentDirectory = root
command = Chr(34) & root & "\runtime\node.exe" & Chr(34) & " " & Chr(34) & root & "\launch.mjs" & Chr(34)
shell.Run command, 0, False
