using System;
using System.Drawing;
using System.Windows.Forms;

// Deterministic Computer Use test fixture. Deliberately NOT hosted by a shell
// process, because shell windows are hard-denied by the plugin's safety layer.
public static class FixtureForm
{
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    static extern bool SetProcessDpiAwarenessContext(IntPtr context);

    [STAThread]
    public static void Main(string[] args)
    {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (EntryPointNotFoundException) { }
        Application.EnableVisualStyles();
        Form form = new Form();
        form.Text = "DSH CU Test Form";
        form.Width = 560;
        form.Height = 280;
        form.StartPosition = FormStartPosition.CenterScreen;

        Label label = new Label();
        label.Text = "Computer Use fixture";
        label.Left = 20; label.Top = 12; label.Width = 300;
        form.Controls.Add(label);

        TextBox box = new TextBox();
        box.Name = "cu-test-input";
        box.Left = 20; box.Top = 40; box.Width = 500;
        if (args.Length == 2 && args[0] == "--progress-file")
        {
            string progressFile = args[1];
            box.TextChanged += delegate {
                try { System.IO.File.WriteAllText(progressFile, box.Text.Length.ToString()); } catch { }
            };
        }
        form.Controls.Add(box);

        Button clear = new Button();
        clear.Name = "cu-test-delete";
        clear.Text = "Delete all";
        clear.Left = 20; clear.Top = 90; clear.Width = 140;
        clear.Click += delegate { box.Text = ""; };
        form.Controls.Add(clear);

        Label status = new Label();
        status.Name = "cu-test-status";
        status.Text = "ready";
        status.Left = 180; status.Top = 98; status.Width = 320;
        form.Controls.Add(status);

        if (args.Length == 2 && args[0] == "--geometry-file")
        {
            // Keep this dedicated input target outside other applications' z-order during the holding test.
            form.TopMost = true;
            string path = args[1];
            string previous = "";
            Rectangle original = Rectangle.Empty;
            Timer timer = new Timer();
            timer.Interval = 40;
            timer.Tick += delegate {
                try
                {
                    if (!System.IO.File.Exists(path)) return;
                    string command = System.IO.File.ReadAllText(path);
                    if (command == previous) return;
                    if (original.IsEmpty) original = form.Bounds;
                    if (command.StartsWith("large:")) form.ClientSize = new Size(1920, 1080);
                    else if (command.StartsWith("move:")) form.Location = new Point(form.Left + 24, form.Top + 12);
                    else if (command.StartsWith("restore:")) form.Bounds = original;
                    else return;
                    previous = command;
                    System.IO.File.WriteAllText(path + ".done", command);
                }
                catch (System.IO.IOException) { }
            };
            timer.Start();
        }

        Application.Run(form);
    }
}
