using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// "DSH is using your computer" indicator, modelled on Codex's overlays:
//   * Display Overlay  - a breathing accent border around the whole virtual screen
//                        (Codex: "border size breath" / "border offset breath")
//   * Cursor Overlay   - a virtual cursor that glides to every pointer action, with
//                        optional suppression of the real system cursor
//   * Esc              - kill switch; writes a cancel file the helper checks before
//                        it injects anything
// Everything is layered, per-pixel alpha, click-through and never takes focus.
public sealed class Config
{
    public static string CancelFile = "";
    public static string CursorFile = "";
    public static string AccentHex = "#3f7fd8";
    public static string Title = "DSH 正在使用您的电脑";
    public static string Hint = "Esc 取消";
    public static bool SuppressCursor = false;
    public static int Corner1 = 0; // unused placeholder kept for arg compatibility
    public static Color Accent = Color.FromArgb(63, 127, 216);
}

public static class Native
{
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct SIZE { public int CX, CY; }
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct BLENDFUNCTION { public byte BlendOp; public byte BlendFlags; public byte SourceConstantAlpha; public byte AlphaFormat; }

    [DllImport("user32.dll")] public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize, IntPtr hdcSrc, ref POINT pptSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr h);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr SetSystemCursor(IntPtr hcur, uint id);
    [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint action, uint param, IntPtr pv, uint winIni);
    [DllImport("user32.dll")] public static extern IntPtr CreateCursor(IntPtr inst, int x, int y, int w, int h, byte[] andMask, byte[] xorMask);
    [DllImport("user32.dll")] public static extern IntPtr CopyIcon(IntPtr hIcon);
    [DllImport("user32.dll")] public static extern bool DestroyCursor(IntPtr hCursor);

    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    public const uint SWP_NOSIZE = 0x0001, SWP_NOMOVE = 0x0002, SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040;
    public const int ULW_ALPHA = 2;
    public const uint SPI_SETCURSORS = 0x0057;

    public static void ApplyLayered(Form form, Bitmap surface)
    {
        IntPtr screenDc = GetDC(IntPtr.Zero);
        IntPtr memDc = CreateCompatibleDC(screenDc);
        IntPtr hBitmap = surface.GetHbitmap(Color.FromArgb(0));
        IntPtr oldBitmap = SelectObject(memDc, hBitmap);
        try
        {
            POINT dst = new POINT { X = form.Left, Y = form.Top };
            POINT src = new POINT { X = 0, Y = 0 };
            SIZE size = new SIZE { CX = surface.Width, CY = surface.Height };
            BLENDFUNCTION blend = new BLENDFUNCTION { BlendOp = 0, BlendFlags = 0, SourceConstantAlpha = 255, AlphaFormat = 1 };
            UpdateLayeredWindow(form.Handle, screenDc, ref dst, ref size, memDc, ref src, 0, ref blend, ULW_ALPHA);
        }
        finally
        {
            SelectObject(memDc, oldBitmap);
            DeleteObject(hBitmap);
            DeleteDC(memDc);
            ReleaseDC(IntPtr.Zero, screenDc);
        }
    }

    public static void Raise(Form form)
    {
        try { SetWindowPos(form.Handle, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW); } catch { }
    }

    public static void SuppressSystemCursors(bool suppress)
    {
        try
        {
            if (!suppress) { SystemParametersInfo(SPI_SETCURSORS, 0, IntPtr.Zero, 0); return; }
            byte[] andMask = new byte[128];
            byte[] xorMask = new byte[128];
            for (int i = 0; i < andMask.Length; i++) andMask[i] = 0xFF;
            IntPtr blank = CreateCursor(IntPtr.Zero, 0, 0, 32, 32, andMask, xorMask);
            if (blank == IntPtr.Zero) return;
            uint[] ids = new uint[] { 32512, 32513, 32514, 32515, 32516, 32631, 32640, 32641, 32642, 32643, 32644, 32645, 32646, 32648, 32649, 32650, 32651, 32671 };
            foreach (uint id in ids) SetSystemCursor(CopyIcon(blank), id);
            DestroyCursor(blank);
        }
        catch { }
    }
}

public sealed class CursorForm : Form
{
    public PointF Position = new PointF(-2000, -2000);
    public PointF Target = new PointF(-2000, -2000);
    public DateTime Last = DateTime.MinValue;
    public bool Live = false;
    float pulse = 0f;
    const int Box = 96;

    public CursorForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        Size = new Size(Box, Box);
        BackColor = Color.Black;
        SetStyle(ControlStyles.Opaque, true);
    }

    protected override bool ShowWithoutActivation { get { return true; } }
    protected override void OnPaint(PaintEventArgs e) { }
    protected override void OnPaintBackground(PaintEventArgs e) { }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= 0x00080000 | 0x00000020 | 0x00000080 | 0x08000000 | 0x00000008;
            return cp;
        }
    }

    public void Aim(float x, float y)
    {
        Target = new PointF(x, y);
        if (!Live) { Position = Target; Live = true; }
    }

    public void Tick(double idleMs)
    {
        Position = new PointF(
            Position.X + (Target.X - Position.X) * 0.35f,
            Position.Y + (Target.Y - Position.Y) * 0.35f);
        pulse = (float)((Math.Sin(DateTime.UtcNow.Ticks / 900000.0) + 1.0) / 2.0);
        double fade = 1.0; // stays visible for the whole overlay lifetime
        Left = (int)Position.X - Box / 2;
        Top = (int)Position.Y - Box / 2;

        using (Bitmap surface = new Bitmap(Box, Box, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(surface))
            {
                g.Clear(Color.Transparent);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                int alpha = (int)(255 * fade);
                float cx = Box / 2f, cy = Box / 2f;

                // very soft halo so the pointer reads on busy backgrounds
                using (GraphicsPath haloPath = new GraphicsPath())
                {
                    haloPath.AddEllipse(cx - 26f, cy - 26f, 52f, 52f);
                    using (PathGradientBrush halo = new PathGradientBrush(haloPath))
                    {
                        halo.CenterColor = Color.FromArgb((int)(alpha * 0.20), Config.Accent);
                        halo.SurroundColors = new Color[] { Color.FromArgb(0, Config.Accent) };
                        g.FillPath(halo, haloPath);
                    }
                }

                // classic pointer, drawn with a dark outline and a soft drop shadow
                PointF[] arrow = new PointF[] {
                    new PointF(cx - 9f, cy - 17f),
                    new PointF(cx - 9f, cy + 11f),
                    new PointF(cx - 3.5f, cy + 5.5f),
                    new PointF(cx + 0.5f, cy + 15f),
                    new PointF(cx + 5f, cy + 13f),
                    new PointF(cx + 1f, cy + 3.5f),
                    new PointF(cx + 8f, cy + 3.5f),
                };
                for (int pass = 3; pass >= 1; pass--)
                {
                    using (SolidBrush shadow = new SolidBrush(Color.FromArgb((int)(alpha * 0.10), 0, 0, 0)))
                    using (Matrix m = new Matrix())
                    {
                        m.Translate(pass * 0.8f, pass * 0.9f);
                        GraphicsPath shifted = new GraphicsPath();
                        shifted.AddPolygon(arrow);
                        shifted.Transform(m);
                        g.FillPath(shadow, shifted);
                        shifted.Dispose();
                    }
                }
                using (SolidBrush fill = new SolidBrush(Color.FromArgb(alpha, 255, 255, 255)))
                    g.FillPolygon(fill, arrow);
                using (Pen outline = new Pen(Color.FromArgb((int)(alpha * 0.85), 24, 32, 48), 1.5f))
                {
                    outline.LineJoin = LineJoin.Round;
                    g.DrawPolygon(outline, arrow);
                }
            }
            if (!Visible) Show();
            Native.ApplyLayered(this, surface);
        }
    }
}

/// The status pill: auto-width glass chip with a status dot, the message, an Esc keycap
/// and a muted hint. It floats in the taskbar margin so it never covers app content.
public sealed class ChipForm : Form
{
    const int PadX = 16;
    const int Gap = 10;
    const int Height0 = 36;

    public ChipForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        Size = new Size(340, Height0);
        BackColor = Color.Black;
        SetStyle(ControlStyles.Opaque, true);
    }

    protected override bool ShowWithoutActivation { get { return true; } }
    protected override void OnPaint(PaintEventArgs e) { }
    protected override void OnPaintBackground(PaintEventArgs e) { }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= 0x00080000 | 0x00000020 | 0x00000080 | 0x08000000 | 0x00000008;
            return cp;
        }
    }

    public void Render(double phase)
    {
        using (Font strong = new Font("Microsoft YaHei UI", 12.5f, FontStyle.Regular, GraphicsUnit.Pixel))
        using (Font weak = new Font("Microsoft YaHei UI", 11.5f, FontStyle.Regular, GraphicsUnit.Pixel))
        using (Font key = new Font("Segoe UI", 10f, FontStyle.Regular, GraphicsUnit.Pixel))
        {
            const string message = "DSH 正在使用您的电脑";
            const string tail = "取消";
            SizeF mSize, tSize, kSize;
            using (Bitmap probe = new Bitmap(1, 1))
            using (Graphics pg = Graphics.FromImage(probe))
            {
                mSize = pg.MeasureString(message, strong);
                tSize = pg.MeasureString(tail, weak);
                kSize = pg.MeasureString("Esc", key);
            }
            int keyW = (int)kSize.Width + 12;
            int keyH = 18;
            int dotW = 14;
            int width = PadX * 2 + dotW + Gap + (int)mSize.Width + Gap + keyW + 6 + (int)tSize.Width;
            if (Width != width) Width = width;

            using (Bitmap surface = new Bitmap(Width, Height0, PixelFormat.Format32bppArgb))
            {
                using (Graphics g = Graphics.FromImage(surface))
                {
                    g.Clear(Color.Transparent);
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

                    RectangleF rect = new RectangleF(0.5f, 0.5f, Width - 1f, Height0 - 1f);
                    using (GraphicsPath path = Rounded(rect, Height0 / 2f))
                    using (SolidBrush body = new SolidBrush(Color.FromArgb(196, 11, 14, 22)))
                    using (Pen border = new Pen(Color.FromArgb(60, 255, 255, 255), 1f))
                    {
                        g.FillPath(body, path);
                        g.DrawPath(border, path);
                    }

                    float x = PadX;
                    float midY = Height0 / 2f;

                    // status dot with a soft ring
                    int pulseA = 110 + (int)(110 * phase);
                    using (SolidBrush ring = new SolidBrush(Color.FromArgb((int)(pulseA * 0.30), Config.Accent)))
                        g.FillEllipse(ring, x - 4f, midY - 4f, 8f, 8f);
                    using (SolidBrush dot = new SolidBrush(Color.FromArgb(255, Config.Accent)))
                        g.FillEllipse(dot, x - 1.5f, midY - 1.5f, 3f, 3f);
                    x += dotW + Gap;

                    using (SolidBrush textStrong = new SolidBrush(Color.FromArgb(243, 241, 245, 252)))
                        g.DrawString(message, strong, textStrong, x, midY - mSize.Height / 2f + 1f);
                    x += mSize.Width + Gap;

                    // Esc keycap
                    RectangleF cap = new RectangleF(x, midY - keyH / 2f, keyW, keyH);
                    using (GraphicsPath capPath = Rounded(cap, 5f))
                    using (SolidBrush capFill = new SolidBrush(Color.FromArgb(46, 255, 255, 255)))
                    using (Pen capBorder = new Pen(Color.FromArgb(70, 255, 255, 255), 1f))
                    {
                        g.FillPath(capFill, capPath);
                        g.DrawPath(capBorder, capPath);
                    }
                    using (StringFormat center = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                    using (SolidBrush capText = new SolidBrush(Color.FromArgb(225, 226, 232, 244)))
                        g.DrawString("Esc", key, capText, cap, center);
                    x += keyW + 6;

                    using (SolidBrush hint = new SolidBrush(Color.FromArgb(190, 170, 180, 200)))
                        g.DrawString(tail, weak, hint, x, midY - tSize.Height / 2f + 1f);
                }
                if (!Visible) Show();
                Native.ApplyLayered(this, surface);
            }
        }
    }

    static GraphicsPath Rounded(RectangleF r, float radius)
    {
        GraphicsPath path = new GraphicsPath();
        float d = radius * 2f;
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
}

/// One edge of the frame: a soft outward glow plus a crisp 2px core line.
public sealed class StripForm : Form
{
    public StripForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.Black;
        SetStyle(ControlStyles.Opaque, true);
    }

    protected override bool ShowWithoutActivation { get { return true; } }
    protected override void OnPaint(PaintEventArgs e) { }
    protected override void OnPaintBackground(PaintEventArgs e) { }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= 0x00080000 | 0x00000020 | 0x00000080 | 0x08000000 | 0x00000008;
            return cp;
        }
    }

    /// A crisp hairline with two faint halo strokes. Solid colours only: GDI+ gradient
    /// brushes with transparent endpoints can composite as opaque black once the bitmap
    /// goes through GetHbitmap/UpdateLayeredWindow.
    public void RenderEdge(int w, int h, bool vertical, bool flip, int coreAlpha, int glowAlpha)
    {
        if (w <= 0 || h <= 0) return;
        if (Width != w || Height != h) { Width = w; Height = h; }
        using (Bitmap surface = new Bitmap(w, h, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(surface))
            {
                g.Clear(Color.Transparent);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                Color accent = Config.Accent;

                // halo: widest + faintest first, then tighten
                for (int i = 3; i >= 1; i--)
                {
                    float width = i * 3.2f;
                    int alpha = Math.Max(6, glowAlpha / (i + 1));
                    using (Pen halo = new Pen(Color.FromArgb(alpha, accent), width))
                    {
                        halo.Alignment = PenAlignment.Center;
                        if (vertical)
                        {
                            float y = flip ? h - 1.5f : 1.5f;
                            g.DrawLine(halo, 0, y, w, y);
                        }
                        else
                        {
                            float x = flip ? w - 1.5f : 1.5f;
                            g.DrawLine(halo, x, 0, x, h);
                        }
                    }
                }

                // core hairline
                using (Pen core = new Pen(Color.FromArgb(coreAlpha, accent), 2f))
                {
                    core.Alignment = PenAlignment.Center;
                    if (vertical)
                    {
                        float y = flip ? h - 1.5f : 1.5f;
                        g.DrawLine(core, 0, y, w, y);
                    }
                    else
                    {
                        float x = flip ? w - 1.5f : 1.5f;
                        g.DrawLine(core, x, 0, x, h);
                    }
                }
            }
            if (!Visible) Show();
            Native.ApplyLayered(this, surface);
        }
    }
}

/// One rounded corner: the glow and core follow a quarter arc so the frame reads as a
/// single rounded rectangle instead of four straight strips.
public sealed class CornerForm : Form
{
    public CornerForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.Black;
        SetStyle(ControlStyles.Opaque, true);
    }

    protected override bool ShowWithoutActivation { get { return true; } }
    protected override void OnPaint(PaintEventArgs e) { }
    protected override void OnPaintBackground(PaintEventArgs e) { }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= 0x00080000 | 0x00000020 | 0x00000080 | 0x08000000 | 0x00000008;
            return cp;
        }
    }

    public void RenderCorner(int size, int radius, int quadrant, int coreAlpha, int glowAlpha)
    {
        if (Width != size || Height != size) { Width = size; Height = size; }
        using (Bitmap surface = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(surface))
            {
                g.Clear(Color.Transparent);
                g.SmoothingMode = SmoothingMode.AntiAlias;
                float r = radius;
                float inset = 1.4f;
                RectangleF box;
                float startAngle;
                switch (quadrant)
                {
                    case 0: box = new RectangleF(inset, inset, r * 2, r * 2); startAngle = 180; break;
                    case 1: box = new RectangleF(size - r * 2 - inset, inset, r * 2, r * 2); startAngle = 270; break;
                    case 2: box = new RectangleF(size - r * 2 - inset, size - r * 2 - inset, r * 2, r * 2); startAngle = 0; break;
                    default: box = new RectangleF(inset, size - r * 2 - inset, r * 2, r * 2); startAngle = 90; break;
                }
                // tight glow: two soft arcs
                using (Pen wide = new Pen(Color.FromArgb(Math.Max(6, glowAlpha / 2), Config.Accent), 9f)) { wide.Alignment = PenAlignment.Inset; g.DrawArc(wide, box, startAngle, 90); }
                using (Pen narrow = new Pen(Color.FromArgb(Math.Max(8, glowAlpha), Config.Accent), 4f)) { narrow.Alignment = PenAlignment.Inset; g.DrawArc(narrow, box, startAngle, 90); }
                using (Pen core = new Pen(Color.FromArgb(coreAlpha, Config.Accent), 1.6f)) { core.Alignment = PenAlignment.Inset; g.DrawArc(core, box, startAngle, 90); }
            }
            if (!Visible) Show();
            Native.ApplyLayered(this, surface);
        }
    }
}

internal sealed class Controller : ApplicationContext
{
    readonly System.Windows.Forms.Timer _timer = new System.Windows.Forms.Timer();
    readonly StripForm _top = new StripForm();
    readonly StripForm _bottom = new StripForm();
    readonly StripForm _left = new StripForm();
    readonly StripForm _right = new StripForm();
    readonly CornerForm _c0 = new CornerForm(), _c1 = new CornerForm(), _c2 = new CornerForm(), _c3 = new CornerForm();
    readonly ChipForm _chip = new ChipForm();
    readonly CursorForm _cursor = new CursorForm();
    readonly int _ttlMs;
    readonly DateTime _deadline;
    int _tick;
    LowLevelKeyboardProc _hookProc;
    IntPtr _hook;

    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out PointNative pt);
    [StructLayout(LayoutKind.Sequential)] struct PointNative { public int X, Y; }
    delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    const int Radius = 18;   // corner radius
    const int Glow = 16;     // band the halo fades inside

    public Controller(int ttlMs)
    {
        _ttlMs = ttlMs;
        _deadline = DateTime.UtcNow.AddMilliseconds(ttlMs);
        _hookProc = Hook;
        _hook = SetWindowsHookEx(13, _hookProc, IntPtr.Zero, 0);
        _timer.Interval = 45;
        _timer.Tick += (s, e) => Tick();
        _timer.Start();
        Tick();
    }

    IntPtr Hook(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && (wParam == (IntPtr)0x0100 || wParam == (IntPtr)0x0104))
        {
            int vk = Marshal.ReadInt32(lParam);
            if (vk == 0x1B)
            {
                try { if (Config.CancelFile.Length > 0) File.WriteAllText(Config.CancelFile, "cancelled " + DateTime.Now.ToString("o")); } catch { }
                try { ExitThreadCore(); } catch { }
            }
        }
        return CallNextHookEx(_hook, nCode, wParam, lParam);
    }

    void Tick()
    {
        _tick++;
        if (DateTime.UtcNow > _deadline) { ExitThreadCore(); return; }

        Rectangle screen = SystemInformation.VirtualScreen;
        // slow 3.2s breath: the frame gets a little brighter and a touch wider
        double phase = (Math.Sin(_tick / 26.0 - 1.57) + 1.0) / 2.0;
        int coreAlpha = 200 + (int)Math.Round(55 * phase);   // clearly visible, still a hairline
        int glowAlpha = 42 + (int)Math.Round(26 * phase);
        int thickness = Glow;

        int x0 = screen.Left, y0 = screen.Top, w = screen.Width, h = screen.Height;

        _top.RenderEdge(w - Radius * 2, thickness, true, false, coreAlpha, glowAlpha);
        _top.Location = new Point(x0 + Radius, y0);
        _bottom.RenderEdge(w - Radius * 2, thickness, true, true, coreAlpha, glowAlpha);
        _bottom.Location = new Point(x0 + Radius, y0 + h - thickness);
        _left.RenderEdge(thickness, h - Radius * 2, false, false, coreAlpha, glowAlpha);
        _left.Location = new Point(x0, y0 + Radius);
        _right.RenderEdge(thickness, h - Radius * 2, false, true, coreAlpha, glowAlpha);
        _right.Location = new Point(x0 + w - thickness, y0 + Radius);

        int cs = Radius + Glow;
        _c0.RenderCorner(cs, Radius, 0, coreAlpha, glowAlpha); _c0.Location = new Point(x0, y0);
        _c1.RenderCorner(cs, Radius, 1, coreAlpha, glowAlpha); _c1.Location = new Point(x0 + w - cs, y0);
        _c2.RenderCorner(cs, Radius, 2, coreAlpha, glowAlpha); _c2.Location = new Point(x0 + w - cs, y0 + h - cs);
        _c3.RenderCorner(cs, Radius, 3, coreAlpha, glowAlpha); _c3.Location = new Point(x0, y0 + h - cs);

        if (_tick % 25 == 0)
        {
            Native.Raise(_top); Native.Raise(_bottom); Native.Raise(_left); Native.Raise(_right);
            Native.Raise(_c0); Native.Raise(_c1); Native.Raise(_c2); Native.Raise(_c3); Native.Raise(_chip);
            Native.Raise(_cursor);
        }

        _chip.Render(phase);
        _chip.Location = new Point(x0 + (w - _chip.Width) / 2, y0 + h - 74);

        // virtual cursor stands in for the real pointer while the overlay is up
        try
        {
            if (Config.CursorFile.Length > 0 && File.Exists(Config.CursorFile))
            {
                string raw = File.ReadAllText(Config.CursorFile).Trim();
                string[] parts = raw.Split(',');
                if (parts.Length >= 3)
                {
                    DateTime stamp = new DateTime(long.Parse(parts[2]));
                    if (stamp > _cursor.Last)
                    {
                        _cursor.Last = stamp;
                        _cursor.Aim(float.Parse(parts[0], System.Globalization.CultureInfo.InvariantCulture),
                                    float.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture));
                    }
                }
            }
        }
        catch { }

        if (!_cursor.Live)
        {
            PointNative p;
            if (GetCursorPos(out p)) { _cursor.Position = new PointF(p.X, p.Y); _cursor.Target = _cursor.Position; }
            _cursor.Live = true;
        }
        _cursor.Tick(0);
    }

    protected override void ExitThreadCore()
    {
        try { _timer.Stop(); } catch { }
        try { if (_hook != IntPtr.Zero) UnhookWindowsHookEx(_hook); } catch { }
        try
        {
            _top.Close(); _bottom.Close(); _left.Close(); _right.Close();
            _c0.Close(); _c1.Close(); _c2.Close(); _c3.Close();
            _chip.Close(); _cursor.Close();
        }
        catch { }
        Native.SuppressSystemCursors(false);
        base.ExitThreadCore();
    }
}

internal static class Program
{
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
    [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();

    [STAThread]
    private static void Main(string[] args)
    {
        // Per-monitor-v2: without this the process is DPI-virtualized, so a 1707x1067
        // logical screen is scaled onto a 2560x1600 physical one - the frame gets blurry,
        // sized wrong, and action coordinates land in the wrong place.
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        try { SetProcessDPIAware(); } catch { }

        int ttlMs = 20000;
        for (int i = 0; i < args.Length - 1; i++)
        {
            string a = args[i];
            if (a == "--cancel-file") Config.CancelFile = args[i + 1];
            else if (a == "--cursor-file") Config.CursorFile = args[i + 1];
            else if (a == "--accent") Config.AccentHex = args[i + 1];
            else if (a == "--text") Config.Title = args[i + 1];
            else if (a == "--hint") Config.Hint = args[i + 1];
            else if (a == "--ttl-ms") int.TryParse(args[i + 1], out ttlMs);
        }
        Config.SuppressCursor = true;                                   // Codex default
        for (int i = 0; i < args.Length; i++) if (args[i] == "--no-suppress-cursor") Config.SuppressCursor = false;
        try { Config.Accent = ColorTranslator.FromHtml(Config.AccentHex); } catch { }

        if (Config.SuppressCursor)
        {
            Native.SuppressSystemCursors(true);
            AppDomain.CurrentDomain.ProcessExit += (s, e) => Native.SuppressSystemCursors(false);
        }

        Application.EnableVisualStyles();
        Application.Run(new Controller(ttlMs));
        Native.SuppressSystemCursors(false);
    }
}
