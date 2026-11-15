param(
    [Parameter()]
    [int]$ProcessId = 0
)
$ErrorActionPreference = 'Stop'

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'This read-only measurement helper requires Windows.'
}

if (-not ('TutorialDock.WorkAreaReader' -as [type])) {
    $source = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

namespace TutorialDock
{
    public static class WorkAreaReader
    {
        [StructLayout(LayoutKind.Sequential)]
        public struct RECT
        {
            public int left;
            public int top;
            public int right;
            public int bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int x;
            public int y;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MONITORINFO
        {
            public int cbSize;
            public RECT rcMonitor;
            public RECT rcWork;
            public uint dwFlags;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr MonitorFromPoint(POINT point, uint flags);

        [DllImport("user32.dll", EntryPoint = "GetMonitorInfoW", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool GetWindowRect(IntPtr window, out RECT rect);

        public static MONITORINFO ReadPrimary()
        {
            POINT origin = new POINT { x = 0, y = 0 };
            IntPtr monitor = MonitorFromPoint(origin, 1); // MONITOR_DEFAULTTOPRIMARY
            if (monitor == IntPtr.Zero)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "MonitorFromPoint failed.");

            MONITORINFO info = new MONITORINFO();
            info.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
            if (!GetMonitorInfo(monitor, ref info))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "GetMonitorInfoW failed.");
            return info;
        }

        public static RECT ReadWindow(IntPtr window)
        {
            RECT rect;
            if (window == IntPtr.Zero || !GetWindowRect(window, out rect))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "GetWindowRect failed.");
            return rect;
        }
    }
}
'@
    Add-Type -TypeDefinition $source -Language CSharp
}

if ($ProcessId -gt 0) {
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    if ($process.MainWindowHandle -eq [IntPtr]::Zero) {
        throw "Process $ProcessId has no accessible main window."
    }
    $rect = [TutorialDock.WorkAreaReader]::ReadWindow($process.MainWindowHandle)
    [pscustomobject]@{
        processId = $process.Id
        processName = $process.ProcessName
        windowRect = [pscustomobject]@{
            left = $rect.left
            top = $rect.top
            right = $rect.right
            bottom = $rect.bottom
        }
        measurement = 'GetWindowRect outer window rectangle'
    } | ConvertTo-Json -Compress -Depth 3
} else {
    $info = [TutorialDock.WorkAreaReader]::ReadPrimary()
    [pscustomobject]@{
        monitor = [pscustomobject]@{
            left = $info.rcMonitor.left
            top = $info.rcMonitor.top
            right = $info.rcMonitor.right
            bottom = $info.rcMonitor.bottom
        }
        workArea = [pscustomobject]@{
            left = $info.rcWork.left
            top = $info.rcWork.top
            right = $info.rcWork.right
            bottom = $info.rcWork.bottom
        }
        primary = [bool](($info.dwFlags -band 1) -ne 0)
    } | ConvertTo-Json -Compress -Depth 3
}

