
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

// ---------------------------------------------------------------------------
// Platform driver contract. Windows is the only implementation today; the
// interface exists so macOS (AX + CGEvent) and Linux (AT-SPI) drivers can be
// added without touching the DSH plugin layer or the stdio protocol.
// ---------------------------------------------------------------------------
public interface IPlatformDriver : IDisposable
{
    string PlatformName { get; }
    Dictionary<string, object> Ping(Dictionary<string, object> p);
    Dictionary<string, object> Hello(Dictionary<string, object> p);
    Dictionary<string, object> RestoreCursor(Dictionary<string, object> p);
    Dictionary<string, object> GetSystemStatus(Dictionary<string, object> p);
    Dictionary<string, object> GetAppIcons(Dictionary<string, object> p);
    Dictionary<string, object> RevokeApp(Dictionary<string, object> p);
    Dictionary<string, object> MouseMove(Dictionary<string, object> p);
    Dictionary<string, object> ShowWindowWithoutActivation(Dictionary<string, object> p);
    void Maintenance();
    Dictionary<string, object> Close(Dictionary<string, object> p);
    Dictionary<string, object> ListWindows(Dictionary<string, object> p);
    Dictionary<string, object> ListApps(Dictionary<string, object> p);
    Dictionary<string, object> GetWindow(Dictionary<string, object> p);
    Dictionary<string, object> LaunchApp(Dictionary<string, object> p);
    Dictionary<string, object> GetWindowState(Dictionary<string, object> p);
    Dictionary<string, object> Click(Dictionary<string, object> p);
    Dictionary<string, object> PressKey(Dictionary<string, object> p);
    Dictionary<string, object> TypeText(Dictionary<string, object> p);
    Dictionary<string, object> Scroll(Dictionary<string, object> p);
    Dictionary<string, object> Drag(Dictionary<string, object> p);
    Dictionary<string, object> SetValue(Dictionary<string, object> p);
    Dictionary<string, object> PerformSecondaryAction(Dictionary<string, object> p);
    Dictionary<string, object> ActivateWindow(Dictionary<string, object> p);
    Dictionary<string, object> OverlayShow(Dictionary<string, object> p);
    Dictionary<string, object> OverlayHide(Dictionary<string, object> p);
    Dictionary<string, object> Configure(Dictionary<string, object> p);
    Dictionary<string, object> ApproveApp(Dictionary<string, object> p);
    Dictionary<string, object> EndTurn(Dictionary<string, object> p);
    Dictionary<string, object> InvalidateState(Dictionary<string, object> p);
    Dictionary<string, object> StartAudioRecording(Dictionary<string, object> p);
    Dictionary<string, object> StopAudioRecording(Dictionary<string, object> p);
}

/// Per-request time budget. Codex sends x-oai-cua-request-budget-ms with every call
/// and the helper honours it; here the budget bounds capture waits and is reported
/// back when a request overruns so the client and the helper agree on the deadline.
public static class Budget
{
    static long _deadlineTicks;
    static string _cancelFile;

    public static void Begin(long ms, string cancelFile)
    {
        _deadlineTicks = ms > 0 ? DateTime.UtcNow.Ticks + ms * TimeSpan.TicksPerMillisecond : 0;
        _cancelFile = cancelFile;
    }

    public static void Check()
    {
        if (_cancelFile != null && File.Exists(_cancelFile))
        {
            string reason = "cancelled";
            try { reason = File.ReadAllText(_cancelFile).Trim(); } catch { }
            if (reason != "turn_ended" && reason != "timeout") reason = "cancelled";
            throw new ToolError(reason, "the native request was stopped; take a fresh observation before continuing");
        }
        if (Expired()) throw new ToolError("timeout", "the native request exceeded its time budget");
    }

    public static long RemainingMs()
    {
        if (_deadlineTicks == 0) return long.MaxValue / 4;
        return (_deadlineTicks - DateTime.UtcNow.Ticks) / TimeSpan.TicksPerMillisecond;
    }

    public static bool Expired()
    {
        return _deadlineTicks != 0 && RemainingMs() <= 0;
    }
}

public class ToolError : Exception
{
    public readonly string Code;
    public ToolError(string code, string message) : base(message) { Code = code; }
}

// ---------------------------------------------------------------------------
// Windows driver: Win32 + UI Automation + PrintWindow.
// ---------------------------------------------------------------------------
public class WindowsDriver : IPlatformDriver
{
    public string PlatformName { get { return "windows"; } }

    // ---- win32 ----
    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr hWnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
    [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint action, uint param, IntPtr pv, uint winIni);
    [DllImport("user32.dll")] static extern bool SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
    [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT r, int size);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] static extern int GetApplicationUserModelId(IntPtr process, ref uint size, StringBuilder id);
    [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token, int type, out int value, int size, out int returned);
    [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetUserObjectInformationW(IntPtr handle, int index, StringBuilder value, uint size, out uint needed);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT point);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPhysicalPoint(POINT point);
    [DllImport("user32.dll")] static extern bool SetPhysicalCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool GetPhysicalCursorPos(out POINT point);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr handle, uint flags);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern IntPtr GetWindowDC(IntPtr hwnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hwnd, IntPtr dc);
    [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dst, int x, int y, int w, int h, IntPtr src, int sx, int sy, uint op);

    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }

    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Explicit)]
    struct INPUTUNION
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT { public uint type; public INPUTUNION u; }

    const int INPUT_MOUSE = 0;
    const int INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_UNICODE = 0x0004;
    const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;
    const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    const uint MOUSEEVENTF_WHEEL = 0x0800;
    const uint MOUSEEVENTF_HWHEEL = 0x1000;
    const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;

    // ---- state ----
    readonly object _sync = new object();
    sealed class Snapshot
    {
        public long WindowId;
        public DateTime At;
        public Dictionary<long, AutomationElement> Elements = new Dictionary<long, AutomationElement>();
        public Dictionary<long, string> FallbackLabels = new Dictionary<long, string>();
        public List<object> Summary = new List<object>();
        public HashSet<string> RuntimeIds = new HashSet<string>();
        public bool IncludeMenus, Details, HasUnreadableElements;
        public int MaxDepth;
    }

    sealed class Geometry
    {
        public RECT Frame, Client;
        public uint Dpi, Pid;
        public DateTime At;
    }

    readonly Dictionary<long, Snapshot> _snapshots = new Dictionary<long, Snapshot>();
    readonly Dictionary<long, Geometry> _geometry = new Dictionary<long, Geometry>();
    int _snapshotTtlMs = 120000;
    int _maxClickHoldMs = 5000;

    /// A screenshot region the model was handed, so a later coordinate action can
    /// be interpreted in that exact screenshot space (Codex: screenshotId).
    sealed class ShotRegion
    {
        public long WindowId;
        public IntPtr Surface;
        public Geometry Geometry;
        public int OriginX;
        public int OriginY;
        public int Width;
        public int Height;
        /// Physical pixels per screenshot pixel. 1.0 for DPI-aware targets; >1 when
        /// the target is DPI-virtualized and PrintWindow returns an unscaled render.
        public double ScaleX = 1.0;
        public double ScaleY = 1.0;
        public DateTime At;
    }

    // In-use indicator ("DSH 正在使用您的电脑" + whale-girl). Codex draws an animated
    // border and a virtual cursor; this is the DSH equivalent, and Esc is the kill
    // switch: the overlay drops a cancel file that every input path checks first.
    Process _overlay;
    System.Threading.Timer _cursorWatchdog;
    DateTime _overlayUntil = DateTime.MinValue;
    string _overlayCancelFile;
    string _overlayText = "DSH 正在使用您的电脑";
    string _overlayHint = "Esc 取消";
    string _overlayAccent = "#3f7fd8";
    string _cursorFile;      // the overlay polls this to draw the virtual cursor
    /// Turn token that the user interrupted with Esc. Codex persists the same
    /// fact as a marker file per conversation+turn; here the token travels with
    /// every input call, so the block ends exactly when the turn does.
    string _interruptedTurn = null;
    /// Apps the plugin approved through the DSH approval seam. Codex passes the same
    /// fact per request as x-oai-cua-approved-app; here the helper is the enforcer.
    readonly HashSet<string> _approvedApps = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    bool _requireAppApproval = false;
    Process _audioProcess;
    string _audioPath;
    string _audioStopFile;

    readonly Dictionary<string, ShotRegion> _shots = new Dictionary<string, ShotRegion>();
    int _shotTtlMs = 120000;
    int _shotSeq = 0;
    readonly string _shotGeneration = Guid.NewGuid().ToString("N");

    const uint GW_OWNER = 4;
    const int GWL_STYLE = -16;
    const int WS_POPUP = unchecked((int)0x80000000);

    public WindowsDriver()
    {
        Maintenance(); // startup repair: a previous session may have died with cursors hidden
        try { SetProcessDPIAware(); } catch { }
        try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch { }
    }

    public void Dispose()
    {
        if (_cursorWatchdog != null) { _cursorWatchdog.Dispose(); _cursorWatchdog = null; }
        if (_overlay != null) StopOverlay();
        if (_cursorFile != null) { try { File.Delete(_cursorFile); } catch { } }
        if (_audioProcess != null)
        {
            try { if (!_audioProcess.HasExited) _audioProcess.Kill(); } catch { }
            _audioProcess.Dispose();
            try { if (_audioStopFile != null) File.Delete(_audioStopFile); } catch { }
            try { if (_audioPath != null) File.Delete(_audioPath); } catch { }
        }
    }

    // ---- approval plumbing ----
    public Dictionary<string, object> Configure(Dictionary<string, object> p)
    {
        _requireAppApproval = Json.GetBool(p, "requireAppApproval", _requireAppApproval);
        _maxClickHoldMs = (int)Math.Max(0, Math.Min(5000, Json.GetLong(p, "maxClickHoldMs", _maxClickHoldMs)));
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["requireAppApproval"] = _requireAppApproval;
        return r;
    }

    public Dictionary<string, object> ApproveApp(Dictionary<string, object> p)
    {
        string app = Json.GetString(p, "app");
        if (string.IsNullOrEmpty(app)) throw new ToolError("bad_request", "approve_app requires 'app'");
        lock (_sync) { _approvedApps.Add(app); }
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["approved"] = app;
        r["count"] = (long)_approvedApps.Count;
        return r;
    }

    public Dictionary<string, object> RevokeApp(Dictionary<string, object> p)
    {
        string id = Json.GetString(p, "app");
        if (string.IsNullOrEmpty(id)) throw new ToolError("bad_request", "revoke_app requires an app id");
        lock (_sync) { _approvedApps.Remove(id); }
        InvalidateState(p);
        return new Dictionary<string, object> { { "revoked", true } };
    }

    /// Turn boundary: drop per-turn state (element snapshots, screenshot regions, the
    /// Esc block, the indicator) but keep session-scoped app approvals.
    public Dictionary<string, object> EndTurn(Dictionary<string, object> p)
    {
        string ending = Json.GetString(p, "endingTurn") ?? Json.GetString(p, "turnToken");
        if (ending != null) ClearInterrupt(ending);
        lock (_sync) { _snapshots.Clear(); _shots.Clear(); _geometry.Clear(); }
        _interruptedTurn = null;
        StopOverlay();
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["ended"] = true;
        r["approvedApps"] = (long)_approvedApps.Count;
        return r;
    }

    public Dictionary<string, object> InvalidateState(Dictionary<string, object> p)
    {
        lock (_sync) { _snapshots.Clear(); _shots.Clear(); _geometry.Clear(); }
        StopOverlay();
        return new Dictionary<string, object> { { "invalidated", true } };
    }

    void AssertAppApproved(IntPtr h)
    {
        if (!_requireAppApproval) return;
        uint pid;
        GetWindowThreadProcessId(h, out pid);
        string id = AppIdOf(pid);
        if (id == null) throw new ToolError("app_identity_unavailable", "the helper could not identify the window owner");
        lock (_sync) { if (_approvedApps.Contains(id)) return; }
        throw new ToolError("app_not_approved", "the Computer Use policy has not approved '" + id + "' yet. Approve the app through the DSH approval prompt before acting on its windows.");
    }

    // ---- audio recording (WASAPI loopback) ----
    public Dictionary<string, object> StartAudioRecording(Dictionary<string, object> p)
    {
        bool envEnabled = Environment.GetEnvironmentVariable("DSH_CU_AUDIO") == "1";
        bool force = Json.GetBool(p, "force", false);
        // Codex treats computer audio as its own app ("computer-audio") and asks for a
        // separate approval before recording; the plugin passes that here.
        bool audioApproved = Json.GetString(p, "approvedApp") == "computer-audio";
        if (!envEnabled && !force && !audioApproved)
            throw new ToolError("audio_not_enabled", "computer audio recording is not enabled. Approve it (app \"computer-audio\") or set DSH_CU_AUDIO=1.");
        if (_audioProcess != null && !_audioProcess.HasExited)
            throw new ToolError("audio_running", "an audio recording is already running; stop it first");

        string exe = ComponentPath("audio", "dsh-cu-audio.exe");
        if (!File.Exists(exe)) throw new ToolError("audio_missing", "audio recorder not found at " + exe);

        long maxMs = Json.GetLong(p, "maxDurationMs", 60000);
        if (maxMs < 500) maxMs = 500;
        if (maxMs > 300000) maxMs = 300000;   // Codex caps a single recording at 5 minutes
        _audioPath = Path.Combine(Path.GetTempPath(), "dsh-cu-audio-" + Guid.NewGuid().ToString("N") + ".wav");
        _audioStopFile = Path.Combine(Path.GetTempPath(), "dsh-cu-audio-stop-" + Guid.NewGuid().ToString("N") + ".flag");
        try { if (File.Exists(_audioStopFile)) File.Delete(_audioStopFile); } catch { }

        ProcessStartInfo psi = new ProcessStartInfo(exe, "--out \"" + _audioPath + "\" --max-ms " + maxMs + " --stop-file \"" + _audioStopFile + "\"");
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        _audioProcess = Process.Start(psi);
        System.Threading.Thread.Sleep(400);
        if (_audioProcess.HasExited)
            throw new ToolError("audio_not_started", "computer audio recording did not start in time (the recorder exited immediately)");

        Dictionary<string, object> r = new Dictionary<string, object>();
        r["started"] = true;
        r["filepath"] = _audioPath;
        r["maxDurationMs"] = maxMs;
        return r;
    }

    public Dictionary<string, object> StopAudioRecording(Dictionary<string, object> p)
    {
        if (_audioProcess == null) throw new ToolError("audio_not_started", "no audio recording is running");
        try { if (_audioStopFile != null) File.WriteAllText(_audioStopFile, "stop"); } catch { }
        try { _audioProcess.WaitForExit(8000); } catch { }
        try { if (_audioProcess != null && !_audioProcess.HasExited) _audioProcess.Kill(); } catch { }

        string path = _audioPath;
        _audioProcess = null;
        _audioStopFile = null;
        _audioPath = null;

        byte[] audio = new byte[0];
        try { if (path != null && File.Exists(path)) audio = File.ReadAllBytes(path); } catch { }

        Dictionary<string, object> r = new Dictionary<string, object>();
        r["filepath"] = path;
        // Codex returns the raw WAV bytes plus a data URL; base64 is the JSON-safe form.
        r["bytes"] = Convert.ToBase64String(audio);
        r["byteLength"] = (long)audio.Length;
        r["data_url"] = audio.Length > 44 ? "data:audio/wav;base64," + Convert.ToBase64String(audio) : "";
        r["ok"] = audio.Length > 44;
        if (audio.Length <= 44) throw new ToolError("audio_not_recorded", "computer audio recording produced no samples");
        return r;
    }

    // ---- in-use indicator ----
    static string ComponentPath(string name, string file)
    {
        string directory = Path.GetDirectoryName(typeof(WindowsDriver).Assembly.Location) ?? ".";
        string adjacent = Path.Combine(directory, name, file);
        string configured = Environment.GetEnvironmentVariable("DSH_CU_COMPONENT_DIR");
        return File.Exists(adjacent) || string.IsNullOrEmpty(configured) ? adjacent : Path.Combine(configured, name, file);
    }

    static string OverlayExePath()
    {
        string dir = Path.GetDirectoryName(typeof(WindowsDriver).Assembly.Location);
        return Path.Combine(dir ?? ".", "dsh-cu-overlay.exe");
    }

    public Dictionary<string, object> OverlayShow(Dictionary<string, object> p)
    {
        string text = Json.GetString(p, "text");
        if (!string.IsNullOrEmpty(text)) _overlayText = text;
        string hint = Json.GetString(p, "hint");
        if (!string.IsNullOrEmpty(hint)) _overlayHint = hint;
        string accent = Json.GetString(p, "accent");
        if (!string.IsNullOrEmpty(accent)) _overlayAccent = accent;
        EnsureOverlay(Json.GetLong(p, "ttlMs", 20000));
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["visible"] = true;
        r["cancelFile"] = _overlayCancelFile;
        return r;
    }

    public Dictionary<string, object> OverlayHide(Dictionary<string, object> p)
    {
        StopOverlay();
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["visible"] = false;
        return r;
    }

    void EnsureOverlay(long ttlMs)
    {
        string exe = OverlayExePath();
        if (!File.Exists(exe)) return;
        string mode = Environment.GetEnvironmentVariable("DSH_CU_INDICATOR");
        if (mode != null && mode.Equals("off", StringComparison.OrdinalIgnoreCase)) { StopOverlay(); return; }
        string ttlEnv = Environment.GetEnvironmentVariable("DSH_CU_INDICATOR_TTL_MS");
        long parsed;
        if (ttlEnv != null && long.TryParse(ttlEnv, out parsed) && parsed >= 1000) ttlMs = parsed;
        if (_overlay != null && !_overlay.HasExited && DateTime.UtcNow < _overlayUntil)
        {
            _overlayUntil = DateTime.UtcNow.AddMilliseconds(ttlMs);
            return;
        }
        StopOverlay();
        _overlayCancelFile = Path.Combine(Path.GetTempPath(), "dsh-cu-cancel-" + Guid.NewGuid().ToString("N") + ".flag");
        if (_cursorFile == null) _cursorFile = Path.Combine(Path.GetTempPath(), "dsh-cu-cursor-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".flag");
        try { if (File.Exists(_overlayCancelFile)) File.Delete(_overlayCancelFile); } catch { }
        StringBuilder args = new StringBuilder();
        args.Append("--ttl-ms ").Append(ttlMs);
        args.Append(" --cancel-file \"").Append(_overlayCancelFile).Append('"');
        args.Append(" --text \"").Append(_overlayText).Append('"');
        args.Append(" --hint \"").Append(_overlayHint).Append('"');
        args.Append(" --owner-pid ").Append(Process.GetCurrentProcess().Id);
        args.Append(" --accent \"").Append(_overlayAccent).Append('"');
        if (_cursorFile != null) args.Append(" --cursor-file \"").Append(_cursorFile).Append('"');
        // Suppression is the default (the virtual cursor stands in for the real one);
        // DSH_CU_KEEP_CURSOR=1 keeps the real pointer visible instead.
        if (Environment.GetEnvironmentVariable("DSH_CU_KEEP_CURSOR") == "1") args.Append(" --no-suppress-cursor");
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo(exe, args.ToString());
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            _overlay = Process.Start(psi);
            _overlayUntil = DateTime.UtcNow.AddMilliseconds(ttlMs);
            // Codex runs a dedicated system-cursor-manager process that restores the
            // pointer the moment its parent dies. This timer gives the same guarantee
            // without a second exe: if the overlay vanishes with cursors hidden, the
            // pointer comes back within half a second, with no request needed.
            if (_cursorWatchdog == null)
                _cursorWatchdog = new System.Threading.Timer(delegate { try { Maintenance(); } catch { } }, null, 500, 500);
        }
        catch { _overlay = null; }
    }

    void StopOverlay()
    {
        if (_overlay == null) return;
        try { if (!_overlay.HasExited) { _overlay.Kill(); _overlay.WaitForExit(250); } } catch { }
        _overlay.Dispose();
        // Kill() skips the overlay's exit handlers, which is where it would restore the
        // system cursors. Restore them from here so a terminated overlay can never leave
        // the user without a pointer.
        RestoreCursors();
        try { File.Delete(OverlayCursorFlagPath()); } catch { }
        try { if (_overlayCancelFile != null && File.Exists(_overlayCancelFile)) File.Delete(_overlayCancelFile); } catch { }
        _overlay = null;
        _overlayUntil = DateTime.MinValue;
    }

    /// Esc on the overlay drops a cancel file; honour it before any other input.
    const string EscMessage = "Computer Use was stopped by the user with the physical Escape key. Stop your work, do not call further Computer Use tools in this turn, and send a final message noting that the user stopped Computer Use.";

    void CheckCancel(Dictionary<string, object> p)
    {
        Budget.Check();
        string token = p == null ? null : Json.GetString(p, "turnToken");
        if (token != null && (token == _interruptedTurn || InterruptMarkerExists(token)))
            throw new ToolError("turn_stopped", EscMessage);
        bool overlayExited = _overlay != null && _overlay.HasExited && _overlay.ExitCode == 130;
        bool cancelFile = _overlayCancelFile != null && File.Exists(_overlayCancelFile);
        if (!overlayExited && !cancelFile) return;
        if (cancelFile) { try { File.Delete(_overlayCancelFile); } catch { } }
        _interruptedTurn = token;
        PersistInterrupt(token);
        StopOverlay();
        Program.RequestedExitCode = 130;   // Codex exits 130 when the user hits Esc
        throw new ToolError("cancelled_by_user", EscMessage);
    }

    const int ProtocolVersion = 3;

    static string InterruptMarkerPath(string token)
    {
        string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "dsh-computer-use", "interrupts");
        StringBuilder safe = new StringBuilder();
        if (token != null)
        {
            for (int i = 0; i < token.Length && safe.Length < 64; i++)
            {
                char ch = token[i];
                if (char.IsLetterOrDigit(ch) || ch == '-' || ch == '_' || ch == '.') safe.Append(ch);
                else if (ch == ':') safe.Append('-');
            }
        }
        if (safe.Length == 0) safe.Append("turn");
        return Path.Combine(root, safe.ToString() + ".flag");
    }

    static void PersistInterrupt(string token)
    {
        try
        {
            string path = InterruptMarkerPath(token);
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, DateTime.UtcNow.ToString("o"));
        }
        catch { }
    }

    static bool InterruptMarkerExists(string token)
    {
        try { return File.Exists(InterruptMarkerPath(token)); } catch { return false; }
    }

    static void ClearInterrupt(string token)
    {
        try { File.Delete(InterruptMarkerPath(token)); } catch { }
    }

    /// Publish the pointer target for the virtual cursor. The overlay reads this
    /// file; a missing file simply means "no cursor to draw".
    void MarkCursor(int x, int y)
    {
        if (_cursorFile == null) return;
        try { File.WriteAllText(_cursorFile, x.ToString(System.Globalization.CultureInfo.InvariantCulture) + "," + y.ToString(System.Globalization.CultureInfo.InvariantCulture) + "," + DateTime.UtcNow.Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture)); } catch { }
    }

    static bool DesktopLocked()
    {
        IntPtr desktop = OpenInputDesktop(0, false, 1);
        if (desktop == IntPtr.Zero) return true;
        try
        {
            StringBuilder name = new StringBuilder(128);
            uint needed;
            return !GetUserObjectInformationW(desktop, 2, name, (uint)name.Capacity * 2, out needed)
                || !name.ToString().Equals("Default", StringComparison.OrdinalIgnoreCase);
        }
        finally { CloseDesktop(desktop); }
    }

    static void AssertUnlocked()
    {
        if (DesktopLocked()) throw new ToolError("screen_locked", "the interactive Windows desktop is locked or unavailable");
    }

    public Dictionary<string, object> GetSystemStatus(Dictionary<string, object> p)
    {
        int elevation = 0, returned;
        IntPtr token;
        using (Process process = Process.GetCurrentProcess())
        {
            if (OpenProcessToken(process.Handle, 8, out token))
            {
                try { GetTokenInformation(token, 20, out elevation, sizeof(int), out returned); }
                finally { CloseHandle(token); }
            }
        }
        return new Dictionary<string, object> {
            { "platform", "windows" }, { "helperName", "dsh-computer-use-helper.exe" },
            { "helperPath", typeof(WindowsDriver).Assembly.Location }, { "protocolVersion", ProtocolVersion },
            { "sessionLocked", DesktopLocked() }, { "isElevated", elevation != 0 },
            { "captureAvailable", File.Exists(ComponentPath("capture", "dsh-cu-capture.exe")) },
            { "audioAvailable", File.Exists(ComponentPath("audio", "dsh-cu-audio.exe")) },
            { "cursorSuppressed", File.Exists(OverlayCursorFlagPath()) }
        };
    }

    public Dictionary<string, object> GetAppIcons(Dictionary<string, object> p)
    {
        List<object> paths = Json.Get(p, "paths") as List<object>;
        if (paths == null || paths.Count > 32) throw new ToolError("bad_request", "get_app_icons accepts up to 32 executable paths");
        Dictionary<string, object> icons = new Dictionary<string, object>();
        foreach (object value in paths)
        {
            Budget.Check();
            string path = value as string;
            if (path == null || path.Length < 4 || !char.IsLetter(path[0]) || path[1] != ':' || path[2] != '\\') continue;
            try
            {
                if (new DriveInfo(Path.GetPathRoot(path)).DriveType != DriveType.Fixed || !File.Exists(path)) continue;
                using (Icon icon = Icon.ExtractAssociatedIcon(path))
                using (Bitmap bmp = new Bitmap(64, 64, PixelFormat.Format32bppArgb))
                using (Graphics graphics = Graphics.FromImage(bmp))
                using (MemoryStream output = new MemoryStream())
                {
                    if (icon == null) continue;
                    graphics.DrawIcon(icon, new Rectangle(0, 0, 64, 64));
                    bmp.Save(output, ImageFormat.Png);
                    icons[path] = "data:image/png;base64," + Convert.ToBase64String(output.ToArray());
                }
            }
            catch (Exception) { /* Surfaces can disappear before icon extraction. */ }
        }
        return icons;
    }

    // ---- helpers ----
    static string TitleOf(IntPtr h)
    {
        StringBuilder sb = new StringBuilder(1024);
        GetWindowTextW(h, sb, sb.Capacity);
        return sb.ToString();
    }

    static string ClassOf(IntPtr h)
    {
        StringBuilder sb = new StringBuilder(256);
        GetClassNameW(h, sb, sb.Capacity);
        return sb.ToString();
    }

    static RECT BoundsOf(IntPtr h)
    {
        RECT r;
        try
        {
            if (DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, out r, Marshal.SizeOf(typeof(RECT))) == 0 && r.Right > r.Left)
                return r;
        }
        catch { }
        GetWindowRect(h, out r);
        return r;
    }

    static Dictionary<string, object> RectDict(int x, int y, int w, int h)
    {
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["x"] = x; d["y"] = y; d["width"] = w; d["height"] = h;
        return d;
    }

    static string ProcessPathOf(uint pid)
    {
        try
        {
            using (Process p = Process.GetProcessById((int)pid))
            {
                try { return p.MainModule.FileName; }
                catch { return p.ProcessName; }
            }
        }
        catch { return "unknown"; }
    }

    static string ProcessNameOf(uint pid)
    {
        try { using (Process p = Process.GetProcessById((int)pid)) return p.ProcessName; }
        catch { return "unknown"; }
    }

    static string AumidOf(uint pid)
    {
        IntPtr process = OpenProcess(0x1000, false, pid);
        if (process == IntPtr.Zero) return null;
        try
        {
            uint length = 0;
            if (GetApplicationUserModelId(process, ref length, null) != 122 || length == 0 || length > 2048) return null;
            StringBuilder id = new StringBuilder((int)length);
            return GetApplicationUserModelId(process, ref length, id) == 0 ? id.ToString() : null;
        }
        finally { CloseHandle(process); }
    }

    static string AppIdOf(uint pid)
    {
        string path = ProcessPathOf(pid);
        return AumidOf(pid) ?? (Path.IsPathRooted(path) ? path : null);
    }

    Dictionary<string, object> AppOf(uint pid)
    {
        Dictionary<string, object> app = new Dictionary<string, object>();
        string full = ProcessPathOf(pid);
        string executable = Path.IsPathRooted(full) ? full : null;
        string aumid = AumidOf(pid);
        app["id"] = aumid ?? executable;
        app["executablePath"] = executable;
        app["aumid"] = aumid;
        app["name"] = Path.GetFileNameWithoutExtension(full);
        app["displayName"] = ProcessNameOf(pid);
        app["pid"] = (long)pid;
        try
        {
            using (Process proc = Process.GetProcessById((int)pid))
                app["lastUsedDate"] = proc.StartTime.ToUniversalTime().ToString("o");
        }
        catch { }
        return app;
    }

    Dictionary<string, object> WindowDict(IntPtr h, uint pid, int z)
    {
        RECT r = BoundsOf(h);
        Dictionary<string, object> w = new Dictionary<string, object>();
        w["id"] = (long)h.ToInt64();
        w["title"] = TitleOf(h);
        w["app"] = AppOf(pid);
        w["bounds"] = RectDict(r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top);
        w["zIndex"] = z;
        w["className"] = ClassOf(h);
        return w;
    }

    List<IntPtr> EnumerateWindows(bool visibleOnly)
    {
        List<IntPtr> list = new List<IntPtr>();
        EnumWindows(delegate(IntPtr h, IntPtr lp)
        {
            if (!IsWindow(h)) return true;
            if (visibleOnly && !IsWindowVisible(h)) return true;
            uint pid;
            GetWindowThreadProcessId(h, out pid);
            if (pid == 0) return true;
            RECT r;
            GetWindowRect(h, out r);
            if (r.Right - r.Left < 80 || r.Bottom - r.Top < 60) return true;
            string title = TitleOf(h);
            if (title.Length == 0) return true;
            list.Add(h);
            return true;
        }, IntPtr.Zero);
        return list;
    }

    // ---- methods ----
    public Dictionary<string, object> Ping(Dictionary<string, object> p)
    {
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["platform"] = PlatformName;
        d["pid"] = (long)Process.GetCurrentProcess().Id;
        d["overlayPid"] = _overlay != null && !_overlay.HasExited ? (object)(long)_overlay.Id : null;
        d["ok"] = true;
        d["uia"] = true;
        return d;
    }

    /// Run cheaply before every request: if a previous overlay died while it was hiding
    /// the system cursors, put them back. A blank desktop cursor is worse than a stray
    /// visible one, so this never assumes the overlay cleaned up after itself.
    public void Maintenance()
    {
        try
        {
            string flag = OverlayCursorFlagPath();
            if (!File.Exists(flag)) return;
            int pid;
            if (!int.TryParse(File.ReadAllText(flag).Trim(), out pid)) { RestoreCursors(); return; }
            bool alive;
            try { Process.GetProcessById(pid); alive = true; } catch { alive = false; }
            if (!alive) { RestoreCursors(); try { File.Delete(flag); } catch { } }
        }
        catch { }
    }

    static string OverlayCursorFlagPath()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "dsh-computer-use", "cursor-hidden.flag");
    }

    static void RestoreCursors()
    {
        try { SystemParametersInfo(0x0057, 0, IntPtr.Zero, 0); } catch { }
    }

    public Dictionary<string, object> RestoreCursor(Dictionary<string, object> p)
    {
        if (_overlay != null) StopOverlay();
        else if (!Json.GetBool(p, "ownedOnly", false))
        {
            RestoreCursors();
            try { File.Delete(OverlayCursorFlagPath()); } catch { }
        }
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["restored"] = true;
        return r;
    }

    public Dictionary<string, object> Hello(Dictionary<string, object> p)
    {
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["ok"] = true;
        d["name"] = "dsh-computer-use";
        d["protocolVersion"] = ProtocolVersion;
        d["platform"] = PlatformName;
        List<object> caps = new List<object>();
        foreach (string c in new string[] {
            "window2", "accessibility_tree", "multi_screenshot", "wgc_capture",
            "virtual_cursor", "audio_recording", "turn_interrupt", "app_approval",
            "screenshot_ids", "budgeted_capture", "uia", "wgc", "wasapi", "relative_coords", "hold_ms",
            "app_icons", "window_geometry_guard", "bounded_screenshot" }) caps.Add(c);
        d["capabilities"] = caps;
        return d;
    }

    public Dictionary<string, object> Close(Dictionary<string, object> p)
    {
        Program.RequestedExitCode = 0;
        Program.CloseRequested = true;
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["closed"] = true;
        return d;
    }

    public Dictionary<string, object> ListWindows(Dictionary<string, object> p)
    {
        List<object> outList = new List<object>();
        List<IntPtr> hs = EnumerateWindows(true);
        for (int i = 0; i < hs.Count; i++)
        {
            uint pid;
            GetWindowThreadProcessId(hs[i], out pid);
            outList.Add(WindowDict(hs[i], pid, i));
        }
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["windows"] = outList;
        d["count"] = outList.Count;
        return d;
    }

    public Dictionary<string, object> ListApps(Dictionary<string, object> p)
    {
        Dictionary<string, Dictionary<string, object>> grouped = new Dictionary<string, Dictionary<string, object>>(StringComparer.OrdinalIgnoreCase);
        List<object> apps = new List<object>();
        List<IntPtr> windows = EnumerateWindows(true);
        for (int i = 0; i < windows.Count; i++)
        {
            Budget.Check();
            IntPtr hwnd = windows[i];
            Dictionary<string, object> window = WindowDict(hwnd, PidOf(hwnd), i);
            Dictionary<string, object> app = Json.AsObject(window["app"]);
            string id = Json.GetString(app, "id");
            if (string.IsNullOrEmpty(id)) continue;
            Dictionary<string, object> entry;
            if (!grouped.TryGetValue(id, out entry))
            {
                entry = new Dictionary<string, object>(app);
                entry["isRunning"] = true;
                entry["windows"] = new List<object>();
                grouped[id] = entry;
                apps.Add(entry);
            }
            List<object> owned = (List<object>)entry["windows"];
            owned.Add(window);
            entry["windowCount"] = owned.Count;
        }
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["apps"] = apps;
        d["count"] = apps.Count;
        return d;
    }

    public Dictionary<string, object> GetWindow(Dictionary<string, object> p)
    {
        IntPtr h = ResolveWindow(p);
        uint pid;
        GetWindowThreadProcessId(h, out pid);
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["window"] = WindowDict(h, pid, 0);
        return d;
    }

    public Dictionary<string, object> ActivateWindow(Dictionary<string, object> p)
    {
        CheckCancel(p);
        AssertUnlocked();
        IntPtr h = ResolveWindow(p);
        AssertAppApproved(h);
        bool changed = GetForegroundWindow() != h;
        Activate(h);
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["foregroundChanged"] = changed;
        d["dispatched"] = true;
        d["activated"] = true;
        d["window"] = WindowDict(h, PidOf(h), 0);
        return d;
    }

    public Dictionary<string, object> ShowWindowWithoutActivation(Dictionary<string, object> p)
    {
        CheckCancel(p);
        AssertUnlocked();
        IntPtr h = ResolveWindow(p);
        AssertAppApproved(h);
        if (IsIconic(h)) ShowWindow(h, 4); // SW_SHOWNOACTIVATE
        return new Dictionary<string, object> { { "dispatched", !IsIconic(h) } };
    }

    static uint PidOf(IntPtr h) { uint pid; GetWindowThreadProcessId(h, out pid); return pid; }

    /// Bring a window to the foreground and PROVE it got there. Input is never
    /// injected into a window that is not foreground: SendInput targets whatever
    /// holds focus, so an unproven activation would type into the user's window.
    static void Activate(IntPtr h)
    {
        if (!EnsureForeground(h))
            throw new ToolError("focus_failed", "could not bring window " + h.ToInt64() + " to the foreground, so the input was refused instead of landing in another window. " + DescribeForeground());
    }

    static bool EnsureForeground(IntPtr h)
    {
        if (!IsWindow(h)) throw new ToolError("window_gone", "window " + h.ToInt64() + " no longer exists; call list_windows again");
        if (!IsWindowEnabled(h)) throw new ToolError("window_disabled", "window " + h.ToInt64() + " is disabled (a modal dialog may be blocking it)");
        if (IsIconic(h)) { ShowWindow(h, 9); System.Threading.Thread.Sleep(180); }
        if (GetForegroundWindow() == h) return true;

        uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
        uint thisThread = GetCurrentThreadId();
        bool attached = false;
        try
        {
            if (fgThread != 0 && fgThread != thisThread) attached = AttachThreadInput(thisThread, fgThread, true);
            ShowWindow(h, 5); // SW_SHOW
            BringWindowToTop(h);
            SetForegroundWindow(h);
            SetFocus(h);
        }
        finally { if (attached) AttachThreadInput(thisThread, fgThread, false); }

        if (WaitForeground(h, 10)) return true;

        // Windows refuses foreground changes from a background process. The
        // documented-looking escape hatches, in order of intrusiveness:
        //   1. SwitchToThisWindow (alt-tab semantics, no key injection)
        //   2. a bare Alt press, which lifts the foreground lock for this call
        try { SwitchToThisWindow(h, true); } catch { }
        if (WaitForeground(h, 10)) return true;

        keybd_event(0x12, 0, 0, UIntPtr.Zero);        // VK_MENU down
        keybd_event(0x12, 0, 0x0002, UIntPtr.Zero);   // VK_MENU up
        SetForegroundWindow(h);
        if (WaitForeground(h, 12)) return true;
        return false;
    }

    /// Name the process that currently owns focus: the usual reason a
    /// background host cannot steal it is an always-on-top utility or an
    /// elevated window.
    static string DescribeForeground()
    {
        IntPtr fg = GetForegroundWindow();
        if (fg == IntPtr.Zero) return "No window currently holds the foreground.";
        uint pid;
        GetWindowThreadProcessId(fg, out pid);
        string proc = "unknown";
        try { proc = Process.GetProcessById((int)pid).ProcessName; } catch { }
        string title = TitleOf(fg);
        string cls = ClassOf(fg);
        return "Foreground is held by " + proc + " (pid " + pid + ", class " + cls + (title.Length > 0 ? ", title \"" + Trim(title, 60) + "\"" : "") + "). Bring the target window forward yourself, or close/pause the utility that keeps stealing focus.";
    }

    static bool WaitForeground(IntPtr h, int attempts)
    {
        for (int i = 0; i < attempts; i++)
        {
            if (GetForegroundWindow() == h) { System.Threading.Thread.Sleep(70); return true; }
            System.Threading.Thread.Sleep(40);
        }
        return GetForegroundWindow() == h;
    }

    static void Slow() { System.Threading.Thread.Sleep(120); }

    public Dictionary<string, object> LaunchApp(Dictionary<string, object> p)
    {
        string app = Json.GetString(p, "app");
        if (string.IsNullOrEmpty(app)) throw new ToolError("bad_request", "launch_app requires 'app'");
        // Resolution order matches the API contract: an explicit .exe path first,
        // then a packaged-app id (AUMID) through shell:AppsFolder, then a shell URI
        // such as ms-settings:. A bare unknown string is tried verbatim last.
        string resolved = app;
        if (!File.Exists(app) && app.IndexOf('\\') < 0 && !app.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) && app.IndexOf(':') < 0)
            resolved = "shell:AppsFolder\\" + app;
        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = resolved;
        psi.UseShellExecute = true;
        List<object> args = Json.Get(p, "args") as List<object>;
        if (args != null && args.Count > 0)
        {
            StringBuilder argLine = new StringBuilder();
            for (int i = 0; i < args.Count; i++)
            {
                if (i > 0) argLine.Append(' ');
                string a = Convert.ToString(args[i], System.Globalization.CultureInfo.InvariantCulture) ?? "";
                // A quote or newline would let a caller smuggle extra arguments past the
                // single quoting rule below, so refuse instead of guessing.
                if (a.IndexOf('"') >= 0 || a.IndexOf('\n') >= 0 || a.IndexOf('\r') >= 0)
                    throw new ToolError("bad_request", "launch_app argument " + i + " contains a quote or newline; pass a single plain argument");
                if (a.Length == 0 || a.IndexOf(' ') >= 0 || a.IndexOf('\t') >= 0)
                    argLine.Append('"').Append(a).Append('"');
                else argLine.Append(a);
            }
            psi.Arguments = argLine.ToString();
        }
        Process proc = Process.Start(psi);
        System.Threading.Thread.Sleep(900);
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["launched"] = true;
        d["app"] = app;
        try { d["pid"] = (long)proc.Id; } catch { }
        return d;
    }

    IntPtr ResolveWindow(Dictionary<string, object> p)
    {
        Dictionary<string, object> w = Json.AsObject(Json.Get(p, "window"));
        long id = Json.GetLong(w, "id", 0);
        if (id == 0) id = Json.GetLong(p, "windowId", 0);
        if (id == 0) throw new ToolError("bad_request", "a 'window' object with a numeric 'id' is required (use list_windows / list_apps)");
        IntPtr h = new IntPtr(id);
        if (!IsWindow(h)) throw new ToolError("window_gone", "window " + id + " no longer exists; call list_windows again");
        long expectedPid = Json.GetLong(p, "expectedPid", 0);
        string expectedApp = Json.GetString(p, "expectedAppId");
        if ((expectedPid > 0 && PidOf(h) != expectedPid) || (expectedApp != null && !string.Equals(expectedApp, AppIdOf(PidOf(h)), StringComparison.OrdinalIgnoreCase)))
            throw new ToolError("WINDOW_CHANGED", "the window owner changed; choose the window again");
        return h;
    }

    // ---- observation ----
    static Geometry ReadGeometry(IntPtr h)
    {
        RECT client;
        POINT origin = new POINT();
        if (!GetClientRect(h, out client) || !ClientToScreen(h, ref origin))
            throw new ToolError("window_gone", "cannot read the target window geometry");
        uint dpi = 96;
        try { dpi = GetDpiForWindow(h); } catch (EntryPointNotFoundException) { }
        return new Geometry {
            Frame = BoundsOf(h), Dpi = dpi, Pid = PidOf(h), At = DateTime.UtcNow,
            Client = new RECT { Left = origin.X, Top = origin.Y, Right = origin.X + client.Right, Bottom = origin.Y + client.Bottom }
        };
    }

    static void AssertGeometry(Geometry before, Geometry now)
    {
        if (before.Pid != now.Pid || before.Dpi != now.Dpi
            || Math.Abs((before.Client.Right - before.Client.Left) - (now.Client.Right - now.Client.Left)) > 2
            || Math.Abs((before.Client.Bottom - before.Client.Top) - (now.Client.Bottom - now.Client.Top)) > 2
            || Math.Abs((before.Frame.Right - before.Frame.Left) - (now.Frame.Right - now.Frame.Left)) > 2
            || Math.Abs((before.Frame.Bottom - before.Frame.Top) - (now.Frame.Bottom - now.Frame.Top)) > 2)
            throw new ToolError("WINDOW_CHANGED", "Target window was resized or changed DPI or owner since the last observation. Call get_window_state to capture a fresh state before retrying");
    }

    public Dictionary<string, object> GetWindowState(Dictionary<string, object> p)
    {
        CheckCancel(p);
        AssertUnlocked();
        IntPtr h = ResolveWindow(p);
        AssertAppApproved(h);
        bool includeText = Json.GetBool(p, "include_text", false);
        bool includeShot = Json.GetBool(p, "include_screenshot", false);
        long maxElements = Json.GetLong(p, "maxElements", 260);
        int ttl = (int)Math.Max(1000, Math.Min(3600000, Json.GetLong(p, "ttlMs", _snapshotTtlMs)));
        _snapshotTtlMs = _shotTtlMs = ttl;

        Geometry geometry = ReadGeometry(h);
        Dictionary<string, object> result = new Dictionary<string, object>();
        result["window"] = WindowDict(h, geometry.Pid, 0);
        RECT client = geometry.Client;
        result["clientBounds"] = RectDict(client.Left, client.Top, client.Right - client.Left, client.Bottom - client.Top);
        result["dpiScale"] = geometry.Dpi / 96.0;

        // Codex parity: accessibility is null unless include_text was asked for.
        result["accessibility"] = includeText ? (object)BuildAccessibility(h, maxElements, ttl, p) : null;
        result["screenshots"] = includeShot ? CaptureScreenshots(h, Json.AsObject(Json.Get(p, "region")), Json.GetLong(p, "__requestId", 0)) : new List<object>();
        if (includeText || includeShot)
        {
            Geometry now = ReadGeometry(h);
            AssertGeometry(geometry, now);
            if (now.Frame.Left != geometry.Frame.Left || now.Frame.Top != geometry.Frame.Top)
                throw new ToolError("WINDOW_CHANGED", "the window moved during observation; take a fresh state");
            _geometry[h.ToInt64()] = now;
        }
        return result;
    }

    Dictionary<string, object> BuildAccessibility(IntPtr h, long maxElements, int ttlMs, Dictionary<string, object> p)
    {
        Snapshot snap = new Snapshot();
        snap.WindowId = h.ToInt64();
        snap.At = DateTime.UtcNow;
        snap.MaxDepth = (int)Math.Max(1, Math.Min(64, Json.GetLong(p, "max_depth", 25)));
        snap.IncludeMenus = Json.GetBool(p, "include_menus", false);
        snap.Details = Json.GetBool(p, "details", false);

        StringBuilder tree = new StringBuilder();
        int index = 0;
        AutomationElement root = null;
        try { root = AutomationElement.FromHandle(h); }
        catch (Exception ex) { throw new ToolError("uia_unavailable", "UI Automation cannot read this window: " + ex.Message); }

        string focused = null;
        Walk(root, 0, maxElements, snap, tree, ref index, h, ref focused);

        if (index == 0)
        {
            // Electron/Canvas apps may not expose a tree until accessibility is requested;
            // retry once after a short delay.
            System.Threading.Thread.Sleep(180);
            try { root = AutomationElement.FromHandle(h); } catch { }
            snap.RuntimeIds.Clear();
            Walk(root, 0, maxElements, snap, tree, ref index, h, ref focused);
        }

        lock (_sync) { _snapshots[snap.WindowId] = snap; }

        Dictionary<string, object> state = new Dictionary<string, object>();
        state["tree"] = tree.ToString();
        state["elementCount"] = (long)index;
        state["elements"] = snap.Summary;
        state["hasUnreadableElements"] = snap.HasUnreadableElements;

        // Structured context Codex exposes beside the tree. Each is best-effort:
        // an app that does not implement the pattern simply omits the field.
        try
        {
            List<object> selectedLines = new List<object>();
            foreach (AutomationElement element in snap.Elements.Values)
            {
                try
                {
                    Budget.Check();
                    AutomationElement.AutomationElementInformation info = element.Current;
                    if (info.IsPassword) continue;
                    object tp;
                    if ((info.HasKeyboardFocus || (info.ControlType == ControlType.Document && !state.ContainsKey("document_text")))
                        && element.TryGetCurrentPattern(TextPattern.Pattern, out tp))
                    {
                        TextPattern text = (TextPattern)tp;
                        if (info.ControlType == ControlType.Document) state["document_text"] = text.DocumentRange.GetText(8000);
                        if (info.HasKeyboardFocus)
                        {
                            System.Windows.Automation.Text.TextPatternRange[] ranges = text.GetSelection();
                            if (ranges != null && ranges.Length > 0) state["selected_text"] = ranges[0].GetText(4000);
                        }
                    }
                    object sp;
                    if (selectedLines.Count < 20 && element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out sp) && ((SelectionItemPattern)sp).Current.IsSelected)
                        selectedLines.Add(SafeString(info.Name) + " (" + SafeRole(info) + ")");
                }
                catch (ToolError) { throw; }
                catch { }
            }
            if (selectedLines.Count > 0) state["selected_elements"] = selectedLines;
        }
        catch (ToolError) { throw; }
        catch { }
        state["snapshotAt"] = snap.At.ToString("o");
        state["ttlMs"] = (long)ttlMs;
        if (focused != null) state["focused_element"] = focused;
        return state;
    }

    void Walk(AutomationElement el, int depth, long maxElements, Snapshot snap, StringBuilder sb, ref int index, IntPtr hwnd, ref string focused)
    {
        if (el == null) return;
        AutomationElementCollection kids;
        try { kids = el.FindAll(TreeScope.Children, Condition.TrueCondition); }
        catch
        {
            snap.HasUnreadableElements = true;
            if (sb.Length > 0 && sb[sb.Length - 1] == '\n') sb.Insert(sb.Length - 1, " [unreadable children]");
            return;
        }

        for (int i = 0; i < kids.Count; i++)
        {
            Budget.Check();
            if (index >= maxElements) return;
            AutomationElement k;
            try { k = kids[i]; } catch { snap.HasUnreadableElements = true; continue; }
            AutomationElement.AutomationElementInformation info;
            bool offscreen;
            try { info = k.Current; offscreen = info.IsOffscreen; } catch { snap.HasUnreadableElements = true; continue; }
            if (offscreen) continue;
            try
            {

            int[] runtime = k.GetRuntimeId();
            if (runtime != null && !snap.RuntimeIds.Add(string.Join(".", runtime))) continue;
            long idx = index++;
            snap.Elements[idx] = k;

            string role = SafeRole(info);
            string name = SafeString(info.Name);
            System.Windows.Rect rect = System.Windows.Rect.Empty;
            try { rect = info.BoundingRectangle; } catch { }
            bool hasRect = !rect.IsEmpty && rect.Width > 0 && rect.Height > 0;

            Dictionary<string, object> summary = new Dictionary<string, object>();
            summary["index"] = idx;
            summary["role"] = role;
            summary["name"] = name;
            summary["depth"] = depth;
            summary["focused"] = info.HasKeyboardFocus;
            if (snap.Details) summary["automationId"] = SafeString(info.AutomationId);
            if (hasRect)
            {
                summary["x"] = (int)rect.X;
                summary["y"] = (int)rect.Y;
                summary["width"] = (int)rect.Width;
                summary["height"] = (int)rect.Height;
            }
            snap.Summary.Add(summary);

            sb.Append('[').Append(idx).Append("] ").Append(role);
            if (name.Length > 0) sb.Append(" \"").Append(Trim(name, 120)).Append('"');
            if (hasRect) sb.Append(" @").Append((int)rect.X).Append(',').Append((int)rect.Y).Append(' ').Append((int)rect.Width).Append('x').Append((int)rect.Height);

            List<string> actions = ActionsOf(k);
            summary["actions"] = actions;
            if (snap.Details)
            {
                List<string> patterns = new List<string>();
                foreach (AutomationPattern pattern in k.GetSupportedPatterns()) patterns.Add(pattern.ProgrammaticName);
                summary["patterns"] = patterns;
            }
            if (actions.Count > 0) sb.Append(" [").Append(string.Join(",", actions.ToArray())).Append(']');

            StringBuilder val = new StringBuilder();
            try
            {
                object vp;
                object sp;
                if (k.TryGetCurrentPattern(SelectionItemPattern.Pattern, out sp))
                    summary["selected"] = ((SelectionItemPattern)sp).Current.IsSelected;
                if (!info.IsPassword && k.TryGetCurrentPattern(ValuePattern.Pattern, out vp))
                {
                    summary["valueWritable"] = !((ValuePattern)vp).Current.IsReadOnly;
                    string v = ((ValuePattern)vp).Current.Value;
                    if (!string.IsNullOrEmpty(v)) val.Append(" value=\"").Append(Trim(v, 90)).Append('"');
                }
                else if (!info.IsPassword)
                {
                    object tp;
                    if (k.TryGetCurrentPattern(TextPattern.Pattern, out tp))
                    {
                        string t = ((TextPattern)tp).DocumentRange.GetText(120);
                        if (!string.IsNullOrEmpty(t)) val.Append(" text=\"").Append(Trim(t.Replace("\r", " ").Replace("\n", " "), 90)).Append('"');
                    }
                }
            }
            catch { }
            sb.Append(val.ToString());

            try { if (info.HasKeyboardFocus && focused == null) focused = "[" + idx + "] " + role + " \"" + name + "\""; }
            catch { }

            sb.Append('\n');
            if (depth + 1 < snap.MaxDepth && (snap.IncludeMenus || (role != "Menu" && role != "MenuBar")))
                Walk(k, depth + 1, maxElements, snap, sb, ref index, hwnd, ref focused);
            }
            catch (ToolError) { throw; }
            catch (Exception) { snap.HasUnreadableElements = true; }
        }
    }

    static string SafeRole(AutomationElement.AutomationElementInformation info)
    {
        try { return info.ControlType.ProgrammaticName.Replace("ControlType.", ""); }
        catch { return "Unknown"; }
    }

    static long ToLong(object v) { try { return Convert.ToInt64(v, System.Globalization.CultureInfo.InvariantCulture); } catch { return 0L; } }
    static double ToDouble(object v) { try { return Convert.ToDouble(v, System.Globalization.CultureInfo.InvariantCulture); } catch { return 1.0; } }

    static string SafeString(string s) { return s == null ? "" : s.Replace("\r", " ").Replace("\n", " ").Trim(); }

    static string Trim(string s, int max) { return s.Length <= max ? s : s.Substring(0, max) + "…"; }

    static List<string> ActionsOf(AutomationElement el)
    {
        List<string> a = new List<string>();
        object pattern;
        try { if (el.TryGetCurrentPattern(InvokePattern.Pattern, out pattern)) a.Add("Invoke"); } catch { }
        try { if (el.TryGetCurrentPattern(TogglePattern.Pattern, out pattern)) a.Add("Toggle"); } catch { }
        try { if (el.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pattern)) a.Add("Select"); } catch { }
        try { if (el.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out pattern)) a.Add("ExpandCollapse"); } catch { }
        try { if (el.TryGetCurrentPattern(ScrollPattern.Pattern, out pattern)) a.Add("Scroll"); } catch { }
        try { if (el.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) a.Add("SetValue"); } catch { }
        return a;
    }

    /// Every top-level window that belongs to the same "visual state" as the
    /// target: the window itself plus owned/transient popups (menus, tooltips,
    /// combo drop-downs) that a screenshot of the window alone would hide.
    List<IntPtr> RelatedWindows(IntPtr target)
    {
        RECT main = BoundsOf(target);
        uint targetPid;
        GetWindowThreadProcessId(target, out targetPid);
        List<IntPtr> result = new List<IntPtr>();
        List<IntPtr> all = EnumerateWindows(false);
        for (int i = 0; i < all.Count; i++)
        {
            IntPtr h = all[i];
            if (h == target) continue;
            if (!IsWindowVisible(h)) continue;
            if (IsIconic(h)) continue;
            uint pid;
            GetWindowThreadProcessId(h, out pid);
            if (pid != targetPid) continue;
            bool owned = GetWindow(h, GW_OWNER) == target;
            bool popup = (GetWindowLong(h, GWL_STYLE) & WS_POPUP) != 0;
            if (!owned && !popup) continue;
            RECT r = BoundsOf(h);
            bool intersects = r.Left < main.Right && r.Right > main.Left && r.Top < main.Bottom && r.Bottom > main.Top;
            if (!intersects) continue;
            result.Add(h);
        }
        return result;
    }

    List<object> CaptureScreenshots(IntPtr h, Dictionary<string, object> crop, long requestId)
    {
        if (IsIconic(h))
            throw new ToolError("window_minimized", "window " + h.ToInt64() + " is minimized, so there is nothing to observe: call activate_window (or restore it) and observe again. A minimized window must never be captured, because the image would not be the window.");
        if (!IsWindowVisible(h))
            throw new ToolError("window_not_visible", "window " + h.ToInt64() + " is not visible; activate it before observing.");

        List<IntPtr> order = EnumerateWindows(true); // z-order, topmost first
        List<object> shots = new List<object>();
        List<IntPtr> targets = new List<IntPtr>();
        targets.Add(h);
        if (crop == null) targets.AddRange(RelatedWindows(h));

        int total = Math.Max(1, order.Count);
        for (int i = 0; i < targets.Count; i++)
        {
            IntPtr w = targets[i];
            int zIndex = order.IndexOf(w);
            if (zIndex < 0) zIndex = total - 1;
            Dictionary<string, object> shot = CaptureWindow(w, crop, requestId);
            shot["zIndex"] = (long)(total - zIndex); // larger = visually above
            string id = "shot-" + _shotGeneration + "-" + (++_shotSeq).ToString() + "-" + w.ToInt64().ToString();
            shot["id"] = id;
            Geometry geometry = ReadGeometry(w);
            lock (_sync)
            {
                PruneShots();
                _shots[id] = new ShotRegion
                {
                    WindowId = h.ToInt64(), Surface = w, Geometry = geometry,
                    OriginX = (int)ToLong(shot["originX"]), OriginY = (int)ToLong(shot["originY"]),
                    Width = (int)ToLong(shot["width"]), Height = (int)ToLong(shot["height"]),
                    ScaleX = ToDouble(shot["scaleX"]), ScaleY = ToDouble(shot["scaleY"]),
                    At = DateTime.UtcNow,
                };
            }
            shots.Add(shot);
        }
        return shots;
    }

    void PruneShots()
    {
        if (_shots.Count <= 48) return;
        List<string> stale = new List<string>();
        DateTime cutoff = DateTime.UtcNow.AddMilliseconds(-_shotTtlMs);
        foreach (KeyValuePair<string, ShotRegion> kv in _shots)
            if (kv.Value.At < cutoff) stale.Add(kv.Key);
        for (int i = 0; i < stale.Count; i++) _shots.Remove(stale[i]);
    }

    ShotRegion ResolveShot(IntPtr h, string screenshotId)
    {
        if (string.IsNullOrEmpty(screenshotId))
            throw new ToolError("bad_request", "screenshotId is empty");
        ShotRegion region;
        lock (_sync)
        {
            if (!_shots.TryGetValue(screenshotId, out region))
                throw new ToolError("stale_screenshot", "screenshot '" + screenshotId + "' is no longer cached: it must come from the latest get_window_state for this window. Take a fresh screenshot before retrying.");
        }
        if (region.WindowId != h.ToInt64())
            throw new ToolError("screenshot_mismatch", "screenshot '" + screenshotId + "' belongs to another window; take a fresh observation for this window.");
        if ((DateTime.UtcNow - region.At).TotalMilliseconds > _shotTtlMs)
            throw new ToolError("stale_screenshot", "screenshot '" + screenshotId + "' is older than the screenshot TTL. Take a fresh screenshot before retrying.");
        return region;
    }

    /// Codex rejects a point that falls outside the screenshot the caller referenced
    /// ("is outside screenshot bounds"), because that usually means a stale observation.
    static void AssertPointInsideShot(double x, double y, ShotRegion region, string screenshotId, string what)
    {
        if (double.IsNaN(x) || double.IsNaN(y)) return;
        if (x >= 0 && y >= 0 && x < region.Width && y < region.Height) return;
        throw new ToolError("point_outside_screenshot",
            what + " (" + x.ToString("0.##") + ", " + y.ToString("0.##") + ") is outside screenshot bounds (0,0)-(" +
            region.Width + "," + region.Height + ") for '" + screenshotId + "'. Take a fresh screenshot with get_window_state before retrying.");
    }

    /// Windows.Graphics.Capture via the optional .NET Framework helper.
    static Bitmap TryCaptureWithWgc(IntPtr hwnd)
    {
        try
        {
            string exe = ComponentPath("capture", "dsh-cu-capture.exe");
            if (!File.Exists(exe)) return null;
            string tmp = Path.Combine(Path.GetTempPath(), "dsh-cu-wgc-" + Guid.NewGuid().ToString("N") + ".png");
            try
            {
                long budget = Budget.RemainingMs();
                int waitMs = (int)Math.Max(150, Math.Min(1200, budget - 150));
                ProcessStartInfo psi = new ProcessStartInfo(exe, "--hwnd " + hwnd.ToInt64().ToString() + " --out \"" + tmp + "\" --timeout " + waitMs);
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                using (Process p = Process.Start(psi))
                {
                    if (p == null) return null;
                    try
                    {
                        Stopwatch wait = Stopwatch.StartNew();
                        while (!p.WaitForExit(40))
                        {
                            Budget.Check();
                            if (wait.ElapsedMilliseconds > waitMs + 450) return null;
                        }
                    }
                    finally { if (!p.HasExited) { try { p.Kill(); } catch { } } }
                    if (p.ExitCode != 0 || !File.Exists(tmp)) return null;
                    byte[] bytes = File.ReadAllBytes(tmp);
                    using (MemoryStream ms = new MemoryStream(bytes)) return new Bitmap(ms);
                }
            }
            finally { try { if (File.Exists(tmp)) File.Delete(tmp); } catch { } }
        }
        catch (ToolError) { throw; }
        catch { return null; }
    }

    Dictionary<string, object> CaptureWindow(IntPtr h, Dictionary<string, object> crop, long requestId)
    {
        Stopwatch clock = Stopwatch.StartNew();
        Dictionary<string, object> stages = new Dictionary<string, object>();
        Dictionary<string, object> diagnostic = new Dictionary<string, object> { { "requestId", requestId }, { "stages", stages } };
        Bitmap bitmap = null;
        try
        {
            RECT r = BoundsOf(h);
            int frameWidth = r.Right - r.Left, frameHeight = r.Bottom - r.Top;
            if (frameWidth <= 0 || frameHeight <= 0 || frameWidth > 16384 || frameHeight > 16384
                || (long)frameWidth * frameHeight > 24000000)
                throw new ToolError("capture_bounds", "the window bounds exceed the native capture budget");
            Rectangle wanted = GetCrop(crop, frameWidth, frameHeight);
            stages["geometryCheckMs"] = clock.ElapsedMilliseconds;
            clock.Restart();
            diagnostic["originalSize"] = new int[] { frameWidth, frameHeight };
            stages["backend"] = "wgc";
            bitmap = TryCaptureWithWgc(h);
            bool printed = bitmap != null;
            if (bitmap == null)
            {
                stages["backend"] = "PrintWindow";
                bitmap = new Bitmap(frameWidth, frameHeight, PixelFormat.Format24bppRgb);
                using (Graphics graphics = Graphics.FromImage(bitmap))
                {
                    IntPtr dc = graphics.GetHdc();
                    try { printed = PrintWindow(h, dc, 2); }
                    finally { graphics.ReleaseHdc(dc); }
                }
                if (!printed || IsBlank(bitmap))
                {
                    stages["backend"] = "BitBlt";
                    bitmap.Dispose();
                    bitmap = CaptureVisibleWindow(h, r, frameWidth, frameHeight);
                    printed = false;
                }
                else
                {
                    // DPI-virtualized PrintWindow renders can leave black padding.
                    Rectangle painted = PaintedBounds(bitmap);
                    if (painted.Width > 16 && painted.Height > 16 && (painted.Width < bitmap.Width || painted.Height < bitmap.Height))
                    {
                        Bitmap trimmed = bitmap.Clone(new Rectangle(0, 0, painted.Right, painted.Bottom), bitmap.PixelFormat);
                        bitmap.Dispose();
                        bitmap = trimmed;
                    }
                }
            }
            stages["captureMs"] = clock.ElapsedMilliseconds;
            Budget.Check();
            clock.Restart();
            double ratioX = (double)bitmap.Width / frameWidth, ratioY = (double)bitmap.Height / frameHeight;
            int left = (int)Math.Floor(wanted.Left * ratioX), top = (int)Math.Floor(wanted.Top * ratioY);
            int right = (int)Math.Ceiling(wanted.Right * ratioX), bottom = (int)Math.Ceiling(wanted.Bottom * ratioY);
            int rawWidth = right - left, rawHeight = bottom - top;
            double limit = Math.Min(1.0, 2560.0 / Math.Max(rawWidth, rawHeight));
            int width = Math.Max(1, (int)(rawWidth * limit)), height = Math.Max(1, (int)(rawHeight * limit));
            using (Bitmap delivered = new Bitmap(width, height, PixelFormat.Format24bppRgb))
            using (Graphics graphics = Graphics.FromImage(delivered))
            using (MemoryStream output = new MemoryStream())
            {
                graphics.DrawImage(bitmap, new Rectangle(0, 0, width, height),
                    new Rectangle(left, top, rawWidth, rawHeight), GraphicsUnit.Pixel);
                delivered.Save(output, ImageFormat.Png);
                stages["encodePngMs"] = clock.ElapsedMilliseconds;
                diagnostic["deliveredSize"] = new int[] { width, height };
                return new Dictionary<string, object> {
                    { "mediaType", "image/png" }, { "base64", Convert.ToBase64String(output.ToArray()) },
                    { "width", width }, { "height", height }, { "originX", r.Left + wanted.Left },
                    { "originY", r.Top + wanted.Top }, { "printed", printed },
                    { "scaleX", (double)wanted.Width / width }, { "scaleY", (double)wanted.Height / height },
                    { "diagnostic", diagnostic }
                };
            }
        }
        catch (Exception error)
        {
            stages["elapsedMs"] = clock.ElapsedMilliseconds;
            ToolError native = error as ToolError;
            throw new ToolError(native != null ? native.Code : "capture_failed",
                (native != null ? native.Message : "native window capture failed") + " [cua-screenshot] " + Json.ToJson(diagnostic));
        }
        finally { if (bitmap != null) bitmap.Dispose(); }
    }

    static Rectangle GetCrop(Dictionary<string, object> crop, int width, int height)
    {
        if (crop == null) return new Rectangle(0, 0, width, height);
        long x = Json.GetLong(crop, "x", -1), y = Json.GetLong(crop, "y", -1);
        long w = Json.GetLong(crop, "width", -1), h = Json.GetLong(crop, "height", -1);
        if (x < 0 || y < 0 || w < 1 || h < 1 || w > width || h > height || x > width - w || y > height - h)
            throw new ToolError("bad_request", "screenshot region must be inside the window");
        return new Rectangle((int)x, (int)y, (int)w, (int)h);
    }

    Bitmap CaptureVisibleWindow(IntPtr h, RECT frame, int width, int height)
    {
        StopOverlay();
        foreach (IntPtr other in EnumerateWindows(true))
        {
            if (other == h) break;
            if (IsIconic(other)) continue;
            RECT r = BoundsOf(other);
            if (r.Left < frame.Right && frame.Left < r.Right && r.Top < frame.Bottom && frame.Top < r.Bottom)
                throw new ToolError("capture_occluded", "window capture needs an unobstructed target when using the BitBlt fallback");
        }
        IntPtr source = GetWindowDC(h);
        if (source == IntPtr.Zero) throw new ToolError("capture_failed", "the window device context could not be opened");
        try
        {
            RECT window;
            if (!GetWindowRect(h, out window)) throw new ToolError("window_gone", "the target window closed");
            Bitmap bitmap = new Bitmap(width, height, PixelFormat.Format24bppRgb);
            try
            {
                using (Graphics graphics = Graphics.FromImage(bitmap))
                {
                    IntPtr dest = graphics.GetHdc();
                    try
                    {
                        if (!BitBlt(dest, 0, 0, width, height, source, frame.Left - window.Left, frame.Top - window.Top, 0x00CC0020))
                            throw new ToolError("capture_failed", "BitBlt failed for the target window");
                    }
                    finally { graphics.ReleaseHdc(dest); }
                }
                return bitmap;
            }
            catch { bitmap.Dispose(); throw; }
        }
        finally { ReleaseDC(h, source); }
    }

    /// Bounding box of everything that is not uniform black, i.e. the region the
    /// target actually painted. Used to strip the DPI-virtualization halo.
    static Rectangle PaintedBounds(Bitmap bmp)
    {
        int right = 0, bottom = 0;
        int step = Math.Max(1, Math.Min(bmp.Width, bmp.Height) / 200);
        for (int y = 0; y < bmp.Height; y += step)
        {
            for (int x = 0; x < bmp.Width; x += step)
            {
                Color c = bmp.GetPixel(x, y);
                if (c.R > 8 || c.G > 8 || c.B > 8)
                {
                    if (x > right) right = x;
                    if (y > bottom) bottom = y;
                }
            }
        }
        return new Rectangle(0, 0, Math.Min(bmp.Width, right + step), Math.Min(bmp.Height, bottom + step));
    }

    static bool IsBlank(Bitmap bmp)
    {
        int samples = 0, dark = 0;
        int stepX = Math.Max(1, bmp.Width / 12);
        int stepY = Math.Max(1, bmp.Height / 12);
        for (int y = 0; y < bmp.Height; y += stepY)
        {
            for (int x = 0; x < bmp.Width; x += stepX)
            {
                Color c = bmp.GetPixel(x, y);
                samples++;
                if (c.R < 6 && c.G < 6 && c.B < 6) dark++;
            }
        }
        return samples > 0 && dark == samples;
    }

    // ---- element resolution ----
    AutomationElement ElementAt(IntPtr hwnd, long index)
    {
        Snapshot snap;
        lock (_sync)
        {
            if (!_snapshots.TryGetValue(hwnd.ToInt64(), out snap))
                throw new ToolError("stale_snapshot", "no observation for this window yet: call get_window_state with include_text=true before using element_index");
        }
        if ((DateTime.UtcNow - snap.At).TotalMilliseconds > _snapshotTtlMs)
            throw new ToolError("stale_snapshot", "the element snapshot is older than " + _snapshotTtlMs + "ms: call get_window_state again before acting on element indexes");
        AutomationElement el;
        if (!snap.Elements.TryGetValue(index, out el))
            throw new ToolError("bad_index", "element index " + index + " is not part of the latest observation for this window");
        return el;
    }

    static Dictionary<string, object> ScreenshotTarget(IntPtr h, AutomationElement el)
    {
        RECT obs = BoundsOf(h);
        System.Windows.Rect r = el.Current.BoundingRectangle;
        if (r.IsEmpty || r.Width <= 0 || r.Height <= 0)
            throw new ToolError("no_geometry", "the element has no bounding rectangle; use x/y coordinates instead");
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["screenX"] = (int)r.X + (int)(r.Width / 2);
        d["screenY"] = (int)r.Y + (int)(r.Height / 2);
        d["originX"] = obs.Left;
        d["originY"] = obs.Top;
        return d;
    }

    // ---- input ----
    static void SendMouse(uint flags) { SendMouseData(flags, 0); }

    static void SendMouseData(uint flags, int data)
    {
        INPUT inp = new INPUT();
        inp.type = INPUT_MOUSE;
        inp.u.mi.dx = 0; inp.u.mi.dy = 0;
        inp.u.mi.mouseData = (uint)data;
        inp.u.mi.dwFlags = flags;
        INPUT[] arr = new INPUT[] { inp };
        if (SendInput(1, arr, Marshal.SizeOf(typeof(INPUT))) != 1)
            throw new ToolError("input_rejected", "Windows rejected the mouse input");
    }

    static void KeyDown(ushort vk) { SendKey(vk, 0, 0); }
    static void KeyUp(ushort vk) { SendKey(vk, 0, KEYEVENTF_KEYUP); }

    static void SendKey(ushort vk, ushort scan, uint flags)
    {
        INPUT inp = new INPUT();
        inp.type = INPUT_KEYBOARD;
        inp.u.ki.wVk = vk;
        inp.u.ki.wScan = scan;
        inp.u.ki.dwFlags = flags;
        INPUT[] arr = new INPUT[] { inp };
        SendInput(1, arr, Marshal.SizeOf(typeof(INPUT)));
    }

    static void SendUnicode(char ch, bool up)
    {
        INPUT inp = new INPUT();
        inp.type = INPUT_KEYBOARD;
        inp.u.ki.wVk = 0;
        inp.u.ki.wScan = ch;
        inp.u.ki.dwFlags = KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0);
        INPUT[] arr = new INPUT[] { inp };
        SendInput(1, arr, Marshal.SizeOf(typeof(INPUT)));
    }

    sealed class PointerTarget
    {
        public POINT Point;
        public IntPtr Surface;
    }

    static int RelativeOffset(double coord, int size)
    {
        if (!(coord >= 0 && coord <= 999 && Math.Truncate(coord) == coord) || size <= 0)
            throw new ToolError("bad_request", "relative coordinates must be integers from 0 to 999");
        return Math.Min(size - 1, (int)Math.Floor(coord * size / 1000.0 + 0.5));
    }

    PointerTarget ResolvePoint(IntPtr h, Dictionary<string, object> p, string xKey, string yKey)
    {
        Geometry now = ReadGeometry(h);
        Geometry before;
        bool observed = _geometry.TryGetValue(h.ToInt64(), out before);
        if (observed)
        {
            AssertGeometry(before, now);
            if ((DateTime.UtcNow - before.At).TotalMilliseconds > _shotTtlMs)
                throw new ToolError("fresh_observation_required", "the coordinate observation expired");
        }
        double x = Json.GetDouble(p, xKey, double.NaN), y = Json.GetDouble(p, yKey, double.NaN);
        if (Json.GetBool(p, "relative", false))
        {
            if (!observed) throw new ToolError("SCREENSHOT_REQUIRED", "observe the window before using relative coordinates");
            return new PointerTarget { Surface = h, Point = new POINT {
                X = now.Client.Left + RelativeOffset(x, now.Client.Right - now.Client.Left),
                Y = now.Client.Top + RelativeOffset(y, now.Client.Bottom - now.Client.Top)
            } };
        }
        if (double.IsNaN(x) || double.IsNaN(y))
            throw new ToolError("bad_request", "the pointer action needs finite window or screenshot coordinates");
        string id = Json.GetString(p, "screenshotId");
        if (!string.IsNullOrEmpty(id))
        {
            ShotRegion shot = ResolveShot(h, id);
            AssertPointInsideShot(x, y, shot, id, "pointer");
            if (!IsWindow(shot.Surface) || !IsWindowVisible(shot.Surface))
                throw new ToolError("WINDOW_CHANGED", "the screenshot surface is no longer visible");
            Geometry surface = ReadGeometry(shot.Surface);
            AssertGeometry(shot.Geometry, surface);
            return new PointerTarget { Surface = shot.Surface, Point = new POINT {
                X = shot.OriginX + surface.Frame.Left - shot.Geometry.Frame.Left + (int)Math.Round(x * shot.ScaleX),
                Y = shot.OriginY + surface.Frame.Top - shot.Geometry.Frame.Top + (int)Math.Round(y * shot.ScaleY)
            } };
        }
        if (x < 0 || y < 0 || x >= now.Frame.Right - now.Frame.Left || y >= now.Frame.Bottom - now.Frame.Top)
            throw new ToolError("point_outside_window", "pointer coordinates are outside the target window");
        return new PointerTarget { Surface = h, Point = new POINT {
            X = now.Frame.Left + (int)Math.Round(x), Y = now.Frame.Top + (int)Math.Round(y)
        } };
    }

    static void AssertPointOwner(IntPtr target, POINT point, string code)
    {
        // UIA bounds and screenshot pixels use physical screen coordinates.
        IntPtr hit;
        try { hit = WindowFromPhysicalPoint(point); }
        catch (EntryPointNotFoundException) { hit = WindowFromPoint(point); }
        IntPtr root = hit == IntPtr.Zero ? hit : GetAncestor(hit, 2); // GA_ROOT
        if (root != target)
            throw new ToolError(code, "the pointer point (" + point.X + ", " + point.Y + ") is not owned by the selected window (surface: " + ProcessNameOf(PidOf(root)) + ")");
    }

    void MovePointer(IntPtr target, POINT point, string errorCode)
    {
        AssertPointOwner(target, point, errorCode);
        if (!SetPhysicalCursorPos(point.X, point.Y)) throw new ToolError("pointer_failed", "Windows rejected the pointer move");
        MarkCursor(point.X, point.Y);
    }

    static void AssertPointerReady(IntPtr window, PointerTarget target)
    {
        POINT current;
        if (GetForegroundWindow() != window || !GetPhysicalCursorPos(out current)
            || current.X != target.Point.X || current.Y != target.Point.Y)
            throw new ToolError("focus_failed", "the foreground or pointer changed before the action");
        AssertPointOwner(target.Surface, current, "pointer_intercepted_by_foreign_window");
    }

    static List<ushort> Modifiers(Dictionary<string, object> p)
    {
        List<ushort> keys = new List<ushort>();
        List<object> values = Json.Get(p, "modifiers") as List<object>;
        if (values == null) return keys;
        foreach (object value in values)
        {
            string candidate = Convert.ToString(value).ToLowerInvariant();
            if (DeniedKeys.Contains(candidate)) throw new ToolError("hard_denied", "the Windows key family is hard-denied");
            ushort key;
            switch (candidate)
            {
                case "ctrl": case "control": key = 0x11; break;
                case "alt": key = 0x12; break;
                case "shift": key = 0x10; break;
                default: throw new ToolError("bad_key", "unsupported modifier");
            }
            if (!keys.Contains(key)) keys.Add(key);
        }
        return keys;
    }

    static bool IsDown(int key) { return (GetAsyncKeyState(key) & 0x8000) != 0; }

    static bool ReleaseModifiers(List<ushort> pressed)
    {
        for (int i = pressed.Count - 1; i >= 0; i--) SendVk(pressed[i], true);
        bool released = true;
        foreach (ushort key in pressed)
        {
            if (!IsDown(key)) continue;
            SendVk(key, true);
            released &= !IsDown(key);
        }
        return released;
    }

    void Hold(int milliseconds, Dictionary<string, object> p)
    {
        Stopwatch clock = Stopwatch.StartNew();
        while (clock.ElapsedMilliseconds < milliseconds)
        {
            CheckCancel(p);
            System.Threading.Thread.Sleep((int)Math.Max(1, Math.Min(20, milliseconds - clock.ElapsedMilliseconds)));
        }
    }

    public Dictionary<string, object> Click(Dictionary<string, object> p)
    {
        CheckCancel(p);
        AssertUnlocked();
        IntPtr h = ResolveWindow(p);
        AssertAppApproved(h);
        long index = Json.GetLong(p, "element_index", -1);
        string button = NormalizeButton(Json.GetString(p, "mouse_button") ?? Json.GetString(p, "mouseButton"));
        int count = (int)Json.GetLong(p, "click_count", Json.GetLong(p, "clickCount", 1));
        int hold = (int)Json.GetLong(p, "holdMs", 0);
        if (count < 1 || count > 3 || hold < 0 || hold > _maxClickHoldMs)
            throw new ToolError("bad_request", "click count or hold duration is outside the allowed range");
        List<ushort> modifiers = Modifiers(p);
        AutomationElement element = index >= 0 ? ElementAt(h, index) : null;
        object invoke;
        if (element != null && count == 1 && button == "l" && hold == 0 && modifiers.Count == 0
            && element.TryGetCurrentPattern(InvokePattern.Pattern, out invoke))
        {
            CheckCancel(p);
            EnsureOverlay(8000);
            ((InvokePattern)invoke).Invoke();
            return new Dictionary<string, object> { { "clicked", "invoke" }, { "element_index", index } };
        }

        if (element == null) ResolvePoint(h, p, "x", "y");
        Activate(h);
        ResolveWindow(p);
        PointerTarget target = element == null ? ResolvePoint(h, p, "x", "y") : ResolveElementPoint(h, element);
        EnsureOverlay(Math.Max(8000, hold * count + 1000));
        CheckCancel(p);
        MovePointer(target.Surface, target.Point, "pointer_intercepted_by_foreign_window");
        uint down = MOUSEEVENTF_LEFTDOWN, up = MOUSEEVENTF_LEFTUP;
        int buttonKey = 1;
        if (button == "r") { down = MOUSEEVENTF_RIGHTDOWN; up = MOUSEEVENTF_RIGHTUP; buttonKey = 2; }
        if (button == "m") { down = MOUSEEVENTF_MIDDLEDOWN; up = MOUSEEVENTF_MIDDLEUP; buttonKey = 4; }
        List<ushort> pressed = new List<ushort>();
        bool mouseReleased = true, keysReleased = true;
        try
        {
            Hold(35, p);
            AssertPointerReady(h, target);
            foreach (ushort key in modifiers)
                if (!IsDown(key)) { SendVk(key, false); pressed.Add(key); }
            for (int i = 0; i < count; i++)
            {
                if (i > 0) Hold(60, p);
                CheckCancel(p);
                AssertPointerReady(h, target);
                if (IsDown(buttonKey)) throw new ToolError("input_busy", "the mouse button is already held");
                SendMouse(down);
                try { Hold(hold == 0 ? 22 : hold, p); }
                finally
                {
                    mouseReleased &= ReleaseMouse(up, buttonKey);
                }
            }
        }
        finally { keysReleased = ReleaseModifiers(pressed); }
        return new Dictionary<string, object> {
            { "clicked", "pointer" }, { "screenX", target.Point.X }, { "screenY", target.Point.Y },
            { "clickCount", count }, { "releaseVerified", mouseReleased && keysReleased }
        };
    }

    static PointerTarget ResolveElementPoint(IntPtr h, AutomationElement element)
    {
        Dictionary<string, object> target = ScreenshotTarget(h, element);
        return new PointerTarget { Surface = h, Point = new POINT { X = (int)target["screenX"], Y = (int)target["screenY"] } };
    }

    static bool ReleaseMouse(uint flags, int key)
    {
        try { SendMouse(flags); } catch (ToolError) { /* retry after sampling the key */ }
        System.Threading.Thread.Sleep(10);
        if (IsDown(key))
        {
            try { SendMouse(flags); } catch (ToolError) { return false; }
            System.Threading.Thread.Sleep(10);
        }
        return !IsDown(key) && !DesktopLocked();
    }

    public Dictionary<string, object> MouseMove(Dictionary<string, object> p)
    {
        CheckCancel(p);
        AssertUnlocked();
        IntPtr h = ResolveWindow(p);
        AssertAppApproved(h);
        long index = Json.GetLong(p, "element_index", -1);
        AutomationElement element = index >= 0 ? ElementAt(h, index) : null;
        bool physical = Json.GetBool(p, "useSystemPointer", false);
        PointerTarget target = element == null ? ResolvePoint(h, p, "x", "y") : ResolveElementPoint(h, element);
        if (physical)
        {
            Activate(h);
            ResolveWindow(p);
            target = element == null ? ResolvePoint(h, p, "x", "y") : ResolveElementPoint(h, element);
            EnsureOverlay(8000);
            CheckCancel(p);
            MovePointer(target.Surface, target.Point, "pointer_intercepted_by_foreign_window");
        }
        return new Dictionary<string, object> {
            { "dispatched", physical }, { "hoverRoute", physical ? "system-pointer" : "accessibility" },
            { "systemPointerMoved", physical }, { "screenX", target.Point.X }, { "screenY", target.Point.Y }
        };
    }

    static string NormalizeButton(string b)
    {
        if (string.IsNullOrEmpty(b)) return "l";
        string s = b.Trim().ToLowerInvariant();
        if (s == "right" || s == "r") return "r";
        if (s == "middle" || s == "m") return "m";
        return "l";
    }

    public Dictionary<string, object> PressKey(Dictionary<string, object> p)
    {
        CheckCancel(p);
        AssertUnlocked();
        IntPtr h = ResolveWindow(p);
        AssertAppApproved(h);
        string key = Json.GetString(p, "key");
        if (string.IsNullOrEmpty(key)) throw new ToolError("bad_request", "press_key requires 'key'");
        Activate(h);
        ResolveWindow(p);
        EnsureOverlay(8000);
        Chord(h, key, p);
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["pressed"] = key;
        return r;
    }

    static readonly Dictionary<string, ushort> KeyMap = BuildKeyMap();

    static Dictionary<string, ushort> BuildKeyMap()
    {
        Dictionary<string, ushort> m = new Dictionary<string, ushort>(StringComparer.OrdinalIgnoreCase);
        for (char c = 'a'; c <= 'z'; c++) m[c.ToString()] = (ushort)(0x41 + (c - 'a'));
        for (char c = 'A'; c <= 'Z'; c++) m[c.ToString()] = (ushort)(0x41 + (c - 'A'));
        for (char c = '0'; c <= '9'; c++) m[c.ToString()] = (ushort)(0x30 + (c - '0'));
        m["return"] = 0x0D; m["enter"] = 0x0D; m["kp_enter"] = 0x0D;
        m["tab"] = 0x09; m["space"] = 0x20; m["backspace"] = 0x08; m["escape"] = 0x1B; m["esc"] = 0x1B;
        m["delete"] = 0x2E; m["insert"] = 0x2D; m["home"] = 0x24; m["end"] = 0x23;
        m["page_up"] = 0x21; m["pageup"] = 0x21; m["prior"] = 0x21; m["page_down"] = 0x22; m["pagedown"] = 0x22; m["next"] = 0x22;
        m["left"] = 0x25; m["up"] = 0x26; m["right"] = 0x27; m["down"] = 0x28;
        m["shift_l"] = 0xA0; m["shift"] = 0xA0; m["shift_r"] = 0xA1;
        m["control_l"] = 0xA2; m["control"] = 0xA2; m["ctrl"] = 0xA2; m["control_r"] = 0xA3;
        m["alt_l"] = 0xA4; m["alt"] = 0xA4; m["alt_r"] = 0xA5;
        m["super_l"] = 0x5B; m["win"] = 0x5B; m["meta"] = 0x5B; m["lwin"] = 0x5B; m["super"] = 0x5B;
        m["super_r"] = 0x5C; m["rwin"] = 0x5C;
        m["caps_lock"] = 0x14; m["num_lock"] = 0x90; m["scroll_lock"] = 0x91;
        m["menu"] = 0x5D; m["apps"] = 0x5D; m["print"] = 0x2C; m["pause"] = 0x13;
        m["period"] = 0xBE; m["greater"] = 0xBE; m["comma"] = 0xBC; m["less"] = 0xBC;
        m["slash"] = 0xBF; m["question"] = 0xBF; m["backslash"] = 0xDC; m["bar"] = 0xDC;
        m["semicolon"] = 0xBA; m["colon"] = 0xBA; m["apostrophe"] = 0xDE; m["quote"] = 0xDE;
        m["minus"] = 0xBD; m["underscore"] = 0xBD; m["equal"] = 0xBB; m["plus"] = 0xBB;
        m["bracketleft"] = 0xDB; m["bracketright"] = 0xDD; m["grave"] = 0xC0; m["asciitilde"] = 0xC0;
        for (int i = 1; i <= 24; i++) { m["f" + i] = (ushort)(0x6F + i); }
        // Numpad: both X keysym style (KP_0) and the aliases the API documents.
        for (int i = 0; i <= 9; i++)
        {
            m["kp_" + i] = (ushort)(0x60 + i);
            m["numpad_" + i] = (ushort)(0x60 + i);
        }
        m["kp_add"] = 0x6B; m["numpad_add"] = 0x6B; m["plus_numpad"] = 0x6B;
        m["kp_subtract"] = 0x6D; m["numpad_subtract"] = 0x6D; m["minus_numpad"] = 0x6D;
        m["kp_multiply"] = 0x6A; m["numpad_multiply"] = 0x6A; m["kp_asterisk"] = 0x6A;
        m["kp_divide"] = 0x6F; m["numpad_divide"] = 0x6F; m["kp_slash"] = 0x6F;
        m["kp_decimal"] = 0x6E; m["numpad_decimal"] = 0x6E; m["kp_separator"] = 0x6C;
        m["numpad_enter"] = 0x0D;
        return m;
    }

    static readonly HashSet<ushort> ExtendedKeys = new HashSet<ushort>(new ushort[] {
        0x21,0x22,0x23,0x24,0x25,0x26,0x27,0x28,0x2D,0x2E,0x5B,0x5C,0x5D,0x90,0x6F,0xA3,0xA5
    });

    static void SendVk(ushort vk, bool up)
    {
        uint flags = up ? KEYEVENTF_KEYUP : 0;
        if (ExtendedKeys.Contains(vk)) flags |= KEYEVENTF_EXTENDEDKEY;
        SendKey(vk, 0, flags);
    }

    void Chord(IntPtr h, string chord, Dictionary<string, object> p)
    {
        string[] parts = chord.Split('+');
        List<ushort> keys = new List<ushort>();
        foreach (string raw in parts)
        {
            string token = raw.Trim();
            if (token.Length == 0) continue;
            keys.Add(ResolveKey(token));
        }
        if (keys.Count == 0) throw new ToolError("bad_request", "empty key chord");
        int pressed = 0;
        try
        {
            for (int i = 0; i < keys.Count; i++)
            {
                CheckCancel(p);
                AssertForegroundInput(h);
                SendVk(keys[i], false); pressed++;
                System.Threading.Thread.Sleep(12);
            }
        }
        finally { for (int i = pressed - 1; i >= 0; i--) SendVk(keys[i], true); }
    }

    /// The Windows/Meta key family is hard-denied: it opens Run, Settings and
    /// shell surfaces that Computer Use must never drive. Enforced in the helper
    /// as well as in the plugin, so a direct protocol call cannot bypass it.
    static readonly HashSet<string> DeniedKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
        "win", "win_l", "win_r", "lwin", "rwin", "windows", "windows_l", "windows_r",
        "super", "super_l", "super_r", "meta", "meta_l", "meta_r", "cmd", "command", "os", "os_l", "os_r"
    };

    static ushort ResolveKey(string token)
    {
        if (DeniedKeys.Contains(token))
            throw new ToolError("hard_denied", "the Windows/Meta/Super key ('" + token + "') is hard-denied: it opens Run, Settings and shell surfaces that Computer Use must never drive.");
        ushort vk;
        if (KeyMap.TryGetValue(token, out vk)) return vk;
        if (token.Length == 1)
        {
            char c = token[0];
            short scan = VkKeyScan(c);
            if (scan != -1) return (ushort)(scan & 0xFF);
            return (ushort)char.ToUpperInvariant(c);
        }
        throw new ToolError("bad_key", "unknown key name '" + token + "'");
    }

    [DllImport("user32.dll")] static extern short VkKeyScan(char ch);

    static void AssertForegroundInput(IntPtr h)
    {
        if (GetForegroundWindow() != h) throw new ToolError("focus_failed", "the selected window lost foreground input");
    }

    public Dictionary<string, object> TypeText(Dictionary<string, object> p)
    {
        CheckCancel(p);
        AssertUnlocked();
        IntPtr h = ResolveWindow(p);
        AssertAppApproved(h);
        string text = Json.GetString(p, "text");
        if (text == null) throw new ToolError("bad_request", "type_text requires 'text'");
        Activate(h);
        ResolveWindow(p);
        EnsureOverlay(8000);
        for (int i = 0; i < text.Length; i++)
        {
            CheckCancel(p);
            AssertForegroundInput(h);
            char c = text[i];
            if (c == '\n') { SendVk(0x0D, false); SendVk(0x0D, true); continue; }
            if (c == '\t') { SendVk(0x09, false); SendVk(0x09, true); continue; }
            if (c == '\r') continue;
            SendUnicode(c, false);
            SendUnicode(c, true);
            if ((i & 15) == 0) System.Threading.Thread.Sleep(4);
        }
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["typed"] = (long)text.Length;
        return r;
    }

    public Dictionary<string, object> Scroll(Dictionary<string, object> p)
    {
        CheckCancel(p);
        AssertUnlocked();
        IntPtr h = ResolveWindow(p);
        AssertAppApproved(h);
        // Validation first: an invalid call must not activate a window or move the pointer.
        double scrollY = Json.GetDouble(p, "scrollY", 0);
        double scrollX = Json.GetDouble(p, "scrollX", 0);
        if (Math.Abs(scrollX) < 0.0001 && Math.Abs(scrollY) < 0.0001)
            throw new ToolError("bad_request", "scroll requires a non-zero scrollX or scrollY");
        ResolvePoint(h, p, "x", "y");
        Activate(h);
        ResolveWindow(p);
        PointerTarget target = ResolvePoint(h, p, "x", "y");
        EnsureOverlay(8000);
        CheckCancel(p);
        MovePointer(target.Surface, target.Point, "pointer_intercepted_by_foreign_window");
        Hold(40, p);
        AssertPointerReady(h, target);
        if (Math.Abs(scrollY) > 0.0001) SendMouseData(MOUSEEVENTF_WHEEL, (int)(-scrollY * 120));
        if (Math.Abs(scrollX) > 0.0001) SendMouseData(MOUSEEVENTF_HWHEEL, (int)(-scrollX * 120));
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["scrolled"] = true;
        r["screenX"] = target.Point.X; r["screenY"] = target.Point.Y;
        return r;
    }

    public Dictionary<string, object> Drag(Dictionary<string, object> p)
    {
        CheckCancel(p);
        AssertUnlocked();
        IntPtr h = ResolveWindow(p);
        AssertAppApproved(h);
        if (!Json.GetBool(p, "useSystemPointer", true))
            throw new ToolError("ACCESSIBILITY_DRAG_UNAVAILABLE", "Windows UI Automation has no generic drag action; request the system pointer");
        List<ushort> modifiers = Modifiers(p);
        ResolvePoint(h, p, "from_x", "from_y");
        ResolvePoint(h, p, "to_x", "to_y");
        Activate(h);
        ResolveWindow(p);
        PointerTarget from = ResolvePoint(h, p, "from_x", "from_y");
        PointerTarget to = ResolvePoint(h, p, "to_x", "to_y");
        if (from.Surface != to.Surface) throw new ToolError("bad_request", "drag endpoints must be in one window");
        const string intercepted = "drag_intercepted_by_foreign_window";
        EnsureOverlay(8000);
        CheckCancel(p);
        MovePointer(from.Surface, from.Point, intercepted);
        Hold(60, p);
        AssertPointOwner(from.Surface, from.Point, intercepted);
        AssertPointerReady(h, from);
        if (IsDown(1)) throw new ToolError("input_busy", "the left button is already held");
        bool pressedButton = false;
        List<ushort> pressed = new List<ushort>();
        try
        {
            foreach (ushort key in modifiers)
                if (!IsDown(key)) { SendVk(key, false); pressed.Add(key); }
            SendMouse(MOUSEEVENTF_LEFTDOWN);
            pressedButton = true;
            Hold(80, p);
            const int steps = 16;
            for (int i = 1; i <= steps; i++)
            {
                CheckCancel(p);
                if (GetForegroundWindow() != h) throw new ToolError(intercepted, "foreground changed during dragging");
                POINT point = new POINT {
                    X = from.Point.X + (to.Point.X - from.Point.X) * i / steps,
                    Y = from.Point.Y + (to.Point.Y - from.Point.Y) * i / steps
                };
                MovePointer(from.Surface, point, intercepted);
                Hold(18, p);
            }
            Hold(90, p);
            CheckCancel(p);
            AssertPointOwner(to.Surface, to.Point, intercepted);
            AssertPointerReady(h, to);
        }
        finally
        {
            if (pressedButton)
            {
                ReleaseMouse(MOUSEEVENTF_LEFTUP, 1);
            }
            ReleaseModifiers(pressed);
        }

        Dictionary<string, object> r = new Dictionary<string, object>();
        r["dragged"] = true;
        r["from"] = new int[] { from.Point.X, from.Point.Y };
        r["to"] = new int[] { to.Point.X, to.Point.Y };
        return r;
    }

    public Dictionary<string, object> SetValue(Dictionary<string, object> p)
    {
        CheckCancel(p);
        AssertUnlocked();
        EnsureOverlay(8000);
        IntPtr h = ResolveWindow(p);
        AssertAppApproved(h);
        long elementIndex = Json.GetLong(p, "element_index", -1);
        if (elementIndex < 0) throw new ToolError("bad_request", "set_value requires 'element_index'");
        string value = Json.GetString(p, "value");
        if (value == null) throw new ToolError("bad_request", "set_value requires 'value'");
        AutomationElement el = ElementAt(h, elementIndex);
        object pattern;
        if (!el.TryGetCurrentPattern(ValuePattern.Pattern, out pattern))
            throw new ToolError("pattern_unavailable", "element [" + elementIndex + "] does not expose the Value pattern; use click + type_text instead");
        ((ValuePattern)pattern).SetValue(value);
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["valueSet"] = true;
        r["element_index"] = elementIndex;
        return r;
    }

    public Dictionary<string, object> PerformSecondaryAction(Dictionary<string, object> p)
    {
        CheckCancel(p);
        AssertUnlocked();
        EnsureOverlay(8000);
        IntPtr h = ResolveWindow(p);
        AssertAppApproved(h);
        long elementIndex = Json.GetLong(p, "element_index", -1);
        string action = Json.GetString(p, "action");
        if (elementIndex < 0 || string.IsNullOrEmpty(action))
            throw new ToolError("bad_request", "perform_secondary_action requires 'element_index' and 'action'");
        AutomationElement el = ElementAt(h, elementIndex);
        string a = action.Trim().ToLowerInvariant();
        object pattern;

        if ((a == "raise" || a == "focus") && el.TryGetCurrentPattern(InvokePattern.Pattern, out pattern))
        { ((InvokePattern)pattern).Invoke(); }
        else if (a == "raise" || a == "focus") { try { el.SetFocus(); } catch (Exception ex) { throw new ToolError("action_failed", ex.Message); } }
        else if ((a == "invoke" || a == "press") && el.TryGetCurrentPattern(InvokePattern.Pattern, out pattern))
        { ((InvokePattern)pattern).Invoke(); }
        else if ((a == "expand" || a == "collapse") && el.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out pattern))
        {
            ExpandCollapsePattern ec = (ExpandCollapsePattern)pattern;
            if (a == "expand") ec.Expand(); else ec.Collapse();
        }
        else if ((a == "toggle") && el.TryGetCurrentPattern(TogglePattern.Pattern, out pattern))
        { ((TogglePattern)pattern).Toggle(); }
        else if ((a == "select" || a == "selectitem") && el.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pattern))
        { ((SelectionItemPattern)pattern).Select(); }
        else if (a.StartsWith("scroll") && el.TryGetCurrentPattern(ScrollPattern.Pattern, out pattern))
        {
            ScrollPattern sp = (ScrollPattern)pattern;
            if (a.Contains("up")) sp.ScrollVertical(ScrollAmount.SmallDecrement);
            else if (a.Contains("down")) sp.ScrollVertical(ScrollAmount.SmallIncrement);
            else if (a.Contains("left")) sp.ScrollHorizontal(ScrollAmount.SmallDecrement);
            else if (a.Contains("right")) sp.ScrollHorizontal(ScrollAmount.SmallIncrement);
            else throw new ToolError("bad_action", "unsupported scroll direction in '" + action + "'");
        }
        else
        {
            throw new ToolError("action_unavailable", "element [" + elementIndex + "] does not expose action '" + action + "'");
        }

        Dictionary<string, object> r = new Dictionary<string, object>();
        r["performed"] = action;
        r["element_index"] = elementIndex;
        return r;
    }
}
