using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;
using SharpDX.Direct3D;
using SharpDX.Direct3D11;
using SharpDX.DXGI;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using D3D11Device = SharpDX.Direct3D11.Device;
using D3D11Texture2D = SharpDX.Direct3D11.Texture2D;
using DXGIDevice = SharpDX.DXGI.Device;

namespace DshCuCapture
{
    /// Windows.Graphics.Capture for .NET Framework 4.8 - the same API Codex uses,
    /// with no .NET 8 runtime dependency (Framework 4.8 ships with Windows 10/11).
    internal static class Program
    {
        [ComImport]
        [Guid("A9B3D012-3DF2-4EE3-B8D1-8695F457D3C1")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IDirect3DDxgiInterfaceAccess
        {
            [PreserveSig] int GetInterface(ref Guid iid, out IntPtr result);
        }

        [DllImport("d3d11.dll", ExactSpelling = true)]
        private static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgiDevice, out IntPtr graphicsDevice);

        [DllImport("combase.dll", CharSet = CharSet.Unicode)]
        private static extern int WindowsCreateString(string source, int length, out IntPtr hstring);

        [DllImport("combase.dll")]
        private static extern int RoGetActivationFactory(IntPtr activatableClassId, ref Guid iid, out IntPtr factory);

        [DllImport("combase.dll")]
        private static extern int WindowsDeleteString(IntPtr hstring);

        [DllImport("kernel32.dll", EntryPoint = "RtlMoveMemory")]
        private static extern void CopyMemory(IntPtr destination, IntPtr source, int length);

        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        private delegate int CreateForWindowDelegate(IntPtr thisPtr, IntPtr hwnd, ref Guid iid, out IntPtr item);
        private delegate int CreateForMonitorDelegate(IntPtr thisPtr, IntPtr hmon, ref Guid iid, out IntPtr item);

        [DllImport("user32.dll")] private static extern IntPtr MonitorFromPoint(POINT pt, uint flags);
        [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X, Y; }

        private static bool _suppressBorder = true;

        private sealed class Slot
        {
            public Bitmap Bitmap;
            public Exception Error;
        }

        private static int Main(string[] args)
        {
            long hwnd = 0;
            bool monitor = false;
            bool redactAll = false;
            bool suppressBorder = true;
            var redactRects = new System.Collections.Generic.List<System.Drawing.Rectangle>();
            string output = "capture.png";
            int timeoutMs = 2000;
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "--redact")
                {
                    string[] parts = args[i + 1].Split(',');
                    if (parts.Length == 4)
                        redactRects.Add(new System.Drawing.Rectangle(int.Parse(parts[0]), int.Parse(parts[1]), int.Parse(parts[2]), int.Parse(parts[3])));
                }
                else if (args[i] == "--hwnd") long.TryParse(args[i + 1], out hwnd);
                else if (args[i] == "--out") output = args[i + 1];
                else if (args[i] == "--timeout") int.TryParse(args[i + 1], out timeoutMs);
            }
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--monitor") monitor = true;
                else if (args[i] == "--redact-all") redactAll = true;
                else if (args[i] == "--keep-border") suppressBorder = false;
            }
            if (hwnd == 0 && !monitor) { Console.Error.WriteLine("--hwnd or --monitor is required"); return 2; }

            try
            {
                GraphicsCaptureItem item = monitor ? CreateMonitorItem() : CreateItem(new IntPtr(hwnd));
                using (D3D11Device device = new D3D11Device(DriverType.Hardware, DeviceCreationFlags.BgraSupport))
                using (DXGIDevice dxgi = device.QueryInterface<DXGIDevice>())
                {
                    int hr = CreateDirect3D11DeviceFromDXGIDevice(dxgi.NativePointer, out IntPtr winrtDevicePtr);
                    if (hr < 0) { Console.Error.WriteLine("CreateDirect3D11DeviceFromDXGIDevice hr=0x" + hr.ToString("X8")); return 3; }
                    IDirect3DDevice winrtDevice;
                    try { winrtDevice = (IDirect3DDevice)Marshal.GetObjectForIUnknown(winrtDevicePtr); }
                    finally { Marshal.Release(winrtDevicePtr); }

                    _suppressBorder = suppressBorder;
                    var slot = new Slot();
                    using (var pool = Direct3D11CaptureFramePool.CreateFreeThreaded(
                        winrtDevice, DirectXPixelFormat.B8G8R8A8UIntNormalized, 2, item.Size))
                    using (var session = pool.CreateCaptureSession(item))
                    using (var done = new ManualResetEventSlim(false))
                    {
                        try { session.IsCursorCaptureEnabled = false; } catch { }
                        // Windows 11 draws a yellow frame around any captured window. Kill it
                        // (Codex does the same through its capture-border access path) so the
                        // border never shows up in the picture or on the user's desktop.
                        if (_suppressBorder) { try { session.IsBorderRequired = false; } catch { } }

                        Direct3D11CaptureFramePool owner = pool;
                        D3D11Device gpu = device;
                        pool.FrameArrived += (sender, e) =>
                        {
                            if (slot.Bitmap != null) return;
                            try
                            {
                                using (var frame = owner.TryGetNextFrame())
                                {
                                    if (frame == null) return;
                                    var access = (IDirect3DDxgiInterfaceAccess)frame.Surface;
                                    Guid iid = new Guid("6f15aaf2-d208-4e89-9ab4-489535d34f9c"); // ID3D11Texture2D
                                    IntPtr texPtr;
                                    if (access.GetInterface(ref iid, out texPtr) < 0 || texPtr == IntPtr.Zero) return;
                                    using (var texture = new D3D11Texture2D(texPtr))
                                    {
                                        var desc = texture.Description;
                                        var stagingDesc = new Texture2DDescription
                                        {
                                            Width = desc.Width,
                                            Height = desc.Height,
                                            MipLevels = 1,
                                            ArraySize = 1,
                                            Format = desc.Format,
                                            SampleDescription = new SampleDescription(1, 0),
                                            Usage = ResourceUsage.Staging,
                                            BindFlags = BindFlags.None,
                                            CpuAccessFlags = CpuAccessFlags.Read,
                                            OptionFlags = ResourceOptionFlags.None,
                                        };
                                        using (var staging = new D3D11Texture2D(gpu, stagingDesc))
                                        {
                                            var context = gpu.ImmediateContext;
                                            context.CopyResource(texture, staging);
                                            SharpDX.DataBox box = context.MapSubresource(staging, 0, MapMode.Read, SharpDX.Direct3D11.MapFlags.None);
                                            try
                                            {
                                                Bitmap bmp = new Bitmap(desc.Width, desc.Height, PixelFormat.Format32bppArgb);
                                                BitmapData data = bmp.LockBits(new Rectangle(0, 0, desc.Width, desc.Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                                                for (int y = 0; y < desc.Height; y++)
                                                {
                                                    IntPtr src = IntPtr.Add(box.DataPointer, y * box.RowPitch);
                                                    IntPtr dst = IntPtr.Add(data.Scan0, y * data.Stride);
                                                    CopyMemory(dst, src, desc.Width * 4);
                                                }
                                                bmp.UnlockBits(data);
                                                slot.Bitmap = bmp;
                                            }
                                            finally { context.UnmapSubresource(staging, 0); }
                                        }
                                    }
                                }
                            }
                            catch (Exception ex) { slot.Error = ex; }
                            finally { done.Set(); }
                        };

                        session.StartCapture();
                        done.Wait(timeoutMs);
                        try { session.Dispose(); } catch { }
                    }

                    if (slot.Error != null) { Console.Error.WriteLine(slot.Error.GetType().Name + ": " + slot.Error.Message); return 6; }
                    if (slot.Bitmap == null) { Console.Error.WriteLine("no frame arrived (timeout or empty surface)"); return 4; }

                    if (redactAll || redactRects.Count > 0)
                    {
                        using (var g = Graphics.FromImage(slot.Bitmap))
                        {
                            g.Clear(redactAll ? Color.Black : Color.Transparent);
                            foreach (var rect in redactRects) g.FillRectangle(Brushes.Black, rect);
                        }
                    }
                    int w = slot.Bitmap.Width, h = slot.Bitmap.Height;
                    slot.Bitmap.Save(output, ImageFormat.Png);
                    slot.Bitmap.Dispose();
                    Console.WriteLine("wgc " + w + "x" + h + " -> " + output);
                    return 0;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(ex.GetType().Name + ": " + ex.Message);
                return 5;
            }
        }

        private static GraphicsCaptureItem CreateMonitorItem()
        {
            POINT origin = new POINT { X = 0, Y = 0 };
            IntPtr monitorHandle = MonitorFromPoint(origin, 2); // MONITOR_DEFAULTTONEAREST
            const string className = "Windows.Graphics.Capture.GraphicsCaptureItem";
            WindowsCreateString(className, className.Length, out IntPtr hstr);
            try
            {
                Guid interopIid = new Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356");
                int hr = RoGetActivationFactory(hstr, ref interopIid, out IntPtr factoryPtr);
                if (hr < 0) throw new COMException("RoGetActivationFactory hr=0x" + hr.ToString("X8"), hr);
                IntPtr vtable = Marshal.ReadIntPtr(factoryPtr);
                IntPtr fn = Marshal.ReadIntPtr(vtable, 4 * IntPtr.Size); // CreateForMonitor
                var createForMonitor = (CreateForMonitorDelegate)Marshal.GetDelegateForFunctionPointer(fn, typeof(CreateForMonitorDelegate));
                Guid itemIid = new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");
                int hrItem = createForMonitor(factoryPtr, monitorHandle, ref itemIid, out IntPtr itemPtr);
                Marshal.Release(factoryPtr);
                if (hrItem < 0) throw new COMException("CreateForMonitor hr=0x" + hrItem.ToString("X8"), hrItem);
                try { return (GraphicsCaptureItem)Marshal.GetObjectForIUnknown(itemPtr); }
                finally { Marshal.Release(itemPtr); }
            }
            finally { WindowsDeleteString(hstr); }
        }

        private static GraphicsCaptureItem CreateItem(IntPtr hwnd)
        {
            const string className = "Windows.Graphics.Capture.GraphicsCaptureItem";
            WindowsCreateString(className, className.Length, out IntPtr hstr);
            try
            {
                Guid interopIid = new Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356");
                int hr = RoGetActivationFactory(hstr, ref interopIid, out IntPtr factoryPtr);
                if (hr < 0) throw new COMException("RoGetActivationFactory hr=0x" + hr.ToString("X8"), hr);

                IntPtr vtable = Marshal.ReadIntPtr(factoryPtr);
                IntPtr fn = Marshal.ReadIntPtr(vtable, 3 * IntPtr.Size);
                var createForWindow = (CreateForWindowDelegate)Marshal.GetDelegateForFunctionPointer(fn, typeof(CreateForWindowDelegate));

                Guid itemIid = new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");
                int hrItem = createForWindow(factoryPtr, hwnd, ref itemIid, out IntPtr itemPtr);
                Marshal.Release(factoryPtr);
                if (hrItem < 0) throw new COMException("CreateForWindow hr=0x" + hrItem.ToString("X8"), hrItem);
                try { return (GraphicsCaptureItem)Marshal.GetObjectForIUnknown(itemPtr); }
                finally { Marshal.Release(itemPtr); }
            }
            finally { WindowsDeleteString(hstr); }
        }
    }
}
