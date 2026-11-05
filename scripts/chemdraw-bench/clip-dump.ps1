# Save every format on the Windows clipboard to a folder (one file per format), plus a list.
# Usage: powershell -STA -File ClipDump.ps1 <outDir>
param([Parameter(Mandatory)][string]$Out)
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class Clip {
  [DllImport("user32.dll")] static extern bool OpenClipboard(IntPtr h);
  [DllImport("user32.dll")] static extern bool CloseClipboard();
  [DllImport("user32.dll")] static extern uint EnumClipboardFormats(uint f);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClipboardFormatName(uint f, StringBuilder sb, int n);
  [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint f);
  [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr h);
  [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr h);
  [DllImport("gdi32.dll")] static extern uint GetEnhMetaFileBits(IntPtr h, uint n, byte[] b);
  static readonly Dictionary<uint,string> Std = new Dictionary<uint,string>{{1,"CF_TEXT"},{2,"CF_BITMAP"},{3,"CF_METAFILEPICT"},{7,"CF_OEMTEXT"},{8,"CF_DIB"},{13,"CF_UNICODETEXT"},{14,"CF_ENHMETAFILE"},{16,"CF_LOCALE"},{17,"CF_DIBV5"}};
  public static List<KeyValuePair<string,byte[]>> All() {
    var res = new List<KeyValuePair<string,byte[]>>();
    for (int i = 0; i < 20 && !OpenClipboard(IntPtr.Zero); i++) System.Threading.Thread.Sleep(50);
    try {
      uint f = 0;
      while ((f = EnumClipboardFormats(f)) != 0) {
        string name;
        if (!Std.TryGetValue(f, out name)) { var sb = new StringBuilder(256); name = GetClipboardFormatName(f, sb, 256) > 0 ? sb.ToString() : ("#" + f); }
        byte[] data = null;
        try {
          IntPtr h = GetClipboardData(f);
          if (h != IntPtr.Zero) {
            if (f == 14) { uint n = GetEnhMetaFileBits(h, 0, null); data = new byte[n]; GetEnhMetaFileBits(h, n, data); }
            else if (f != 2 && f != 3) {
              IntPtr p = GlobalLock(h);
              if (p != IntPtr.Zero) { int n = (int)GlobalSize(h).ToUInt64(); data = new byte[n]; Marshal.Copy(p, data, 0, n); GlobalUnlock(h); }
            }
          }
        } catch {}
        res.Add(new KeyValuePair<string,byte[]>(name, data));
      }
    } finally { CloseClipboard(); }
    return res;
  }
}
"@
New-Item -ItemType Directory -Force $Out | Out-Null
$list = @()
foreach ($kv in [Clip]::All()) {
  $safe = ($kv.Key -replace '[^A-Za-z0-9_.+-]', '_')
  $len = if ($kv.Value) { $kv.Value.Length } else { -1 }
  if ($kv.Value) { [IO.File]::WriteAllBytes((Join-Path $Out "$safe.bin"), $kv.Value) }
  $list += "$($kv.Key)`t$len"
}
$list | Set-Content -Encoding utf8 (Join-Path $Out 'formats.txt')
$list
