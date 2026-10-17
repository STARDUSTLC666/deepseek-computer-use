using System;
using System.Drawing;
using System.Windows.Forms;

// Deterministic Computer Use test fixture. Deliberately NOT hosted by a shell
// process, because shell windows are hard-denied by the plugin's safety layer.
public static class FixtureForm
{
    [STAThread]
    public static void Main()
    {
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

        Application.Run(form);
    }
}
