# Deterministic UI fixture for the Computer Use integration test.
# A plain WinForms window: one text box and one destructive-looking button.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = 'DSH CU Test Form'
$form.Width = 560
$form.Height = 280
$form.StartPosition = 'CenterScreen'

$label = New-Object System.Windows.Forms.Label
$label.Text = 'Computer Use fixture'
$label.Left = 20; $label.Top = 12; $label.Width = 300
$form.Controls.Add($label)

$box = New-Object System.Windows.Forms.TextBox
$box.Name = 'cu-test-input'
$box.Left = 20; $box.Top = 40; $box.Width = 500
$box.Text = ''
$form.Controls.Add($box)

$clear = New-Object System.Windows.Forms.Button
$clear.Name = 'cu-test-delete'
$clear.Text = 'Delete all'
$clear.Left = 20; $clear.Top = 90; $clear.Width = 140
$clear.Add_Click({ $box.Text = '' })
$form.Controls.Add($clear)

$status = New-Object System.Windows.Forms.Label
$status.Name = 'cu-test-status'
$status.Text = 'ready'
$status.Left = 180; $status.Top = 98; $status.Width = 320
$form.Controls.Add($status)

[System.Windows.Forms.Application]::Run($form)
