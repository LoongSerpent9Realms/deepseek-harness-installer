# DeepSeek Harness 打包工具（图形界面版）
#
# 依赖: scripts/windows/package-nsis-v2.ps1（核心打包逻辑）
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/package-nsis-gui.ps1
#   或双击运行（需先关联 .ps1 或创建快捷方式）。
# 功能: 填版本号 -> 选输出目录 -> 开始打包 -> 实时日志 -> 完成后一键打开产物文件夹。
# 说明: 若打包在 rolldown 写入 lib 时偶发失败（os error 5），脚本会自动按
#       "构建重试次数" 重试整个 build，直到成功或次数用尽。

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptRoot '..\..')).Path
$pkgV2 = Join-Path $scriptRoot 'package-nsis-v2.ps1'

$defaultVersion = ''
try { $defaultVersion = [string](Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json).version } catch { }

# ---------------- 表单 ----------------
$form = New-Object System.Windows.Forms.Form
$form.Text = 'DeepSeek Harness 打包工具'
$form.Size = New-Object System.Drawing.Size(780, 640)
$form.MinimumSize = New-Object System.Drawing.Size(680, 540)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)

# 版本号
$lblVer = New-Object System.Windows.Forms.Label
$lblVer.Text = '版本号:'
$lblVer.Location = New-Object System.Drawing.Point(16, 20)
$lblVer.AutoSize = $true
$form.Controls.Add($lblVer)

$txtVer = New-Object System.Windows.Forms.TextBox
$txtVer.Location = New-Object System.Drawing.Point(96, 16)
$txtVer.Size = New-Object System.Drawing.Size(220, 24)
$txtVer.Text = $defaultVersion
$form.Controls.Add($txtVer)

$btnDefaultVer = New-Object System.Windows.Forms.Button
$btnDefaultVer.Text = '默认'
$btnDefaultVer.Location = New-Object System.Drawing.Point(326, 14)
$btnDefaultVer.Size = New-Object System.Drawing.Size(60, 28)
$btnDefaultVer.add_Click({ $txtVer.Text = $defaultVersion })
$form.Controls.Add($btnDefaultVer)

# 输出目录
$lblOut = New-Object System.Windows.Forms.Label
$lblOut.Text = '输出目录:'
$lblOut.Location = New-Object System.Drawing.Point(16, 60)
$lblOut.AutoSize = $true
$form.Controls.Add($lblOut)

$txtOut = New-Object System.Windows.Forms.TextBox
$txtOut.Location = New-Object System.Drawing.Point(96, 56)
$txtOut.Size = New-Object System.Drawing.Size(460, 24)
$txtOut.Text = 'dist/windows-gui'
$form.Controls.Add($txtOut)

$btnBrowse = New-Object System.Windows.Forms.Button
$btnBrowse.Text = '浏览...'
$btnBrowse.Location = New-Object System.Drawing.Point(566, 54)
$btnBrowse.Size = New-Object System.Drawing.Size(76, 28)
$btnBrowse.add_Click({
  $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
  $dlg.Description = '选择打包输出目录'
  if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $txtOut.Text = $dlg.SelectedPath }
})
$form.Controls.Add($btnBrowse)

# 选项行
$chkSkipBuild = New-Object System.Windows.Forms.CheckBox
$chkSkipBuild.Text = '跳过构建'
$chkSkipBuild.Location = New-Object System.Drawing.Point(16, 96)
$chkSkipBuild.AutoSize = $true
$form.Controls.Add($chkSkipBuild)

$chkNoClean = New-Object System.Windows.Forms.CheckBox
$chkNoClean.Text = '不清理输出目录'
$chkNoClean.Location = New-Object System.Drawing.Point(130, 96)
$chkNoClean.AutoSize = $true
$form.Controls.Add($chkNoClean)

$lblRetry = New-Object System.Windows.Forms.Label
$lblRetry.Text = '构建重试次数:'
$lblRetry.Location = New-Object System.Drawing.Point(280, 100)
$lblRetry.AutoSize = $true
$form.Controls.Add($lblRetry)

$txtRetry = New-Object System.Windows.Forms.TextBox
$txtRetry.Location = New-Object System.Drawing.Point(392, 96)
$txtRetry.Size = New-Object System.Drawing.Size(48, 24)
$txtRetry.Text = '8'
$form.Controls.Add($txtRetry)

# pnpm store 目录（可选）
$lblStore = New-Object System.Windows.Forms.Label
$lblStore.Text = 'pnpm store:'
$lblStore.Location = New-Object System.Drawing.Point(16, 134)
$lblStore.AutoSize = $true
$form.Controls.Add($lblStore)

$txtStore = New-Object System.Windows.Forms.TextBox
$txtStore.Location = New-Object System.Drawing.Point(96, 130)
$txtStore.Size = New-Object System.Drawing.Size(460, 24)
$txtStore.Text = ''
$txtStore.Enabled = $false
$form.Controls.Add($txtStore)

$chkStore = New-Object System.Windows.Forms.CheckBox
$chkStore.Text = '指定独立 store（避开 DSH 占用）'
$chkStore.Location = New-Object System.Drawing.Point(566, 132)
$chkStore.AutoSize = $true
$chkStore.add_CheckedChanged({
  $txtStore.Enabled = $chkStore.Checked
  if ($chkStore.Checked -and -not $txtStore.Text) {
    $txtStore.Text = Join-Path $env:LOCALAPPDATA 'pnpm\store-dsh-build'
  }
})
$form.Controls.Add($chkStore)

# 操作按钮
$btnPack = New-Object System.Windows.Forms.Button
$btnPack.Text = '开始打包'
$btnPack.Location = New-Object System.Drawing.Point(16, 170)
$btnPack.Size = New-Object System.Drawing.Size(140, 34)
$btnPack.BackColor = [System.Drawing.Color]::FromArgb(225, 232, 255)
$form.Controls.Add($btnPack)

$btnOpen = New-Object System.Windows.Forms.Button
$btnOpen.Text = '打开产物文件夹'
$btnOpen.Location = New-Object System.Drawing.Point(166, 170)
$btnOpen.Size = New-Object System.Drawing.Size(130, 34)
$btnOpen.Enabled = $false
$form.Controls.Add($btnOpen)

# 日志区
$txtLog = New-Object System.Windows.Forms.TextBox
$txtLog.Multiline = $true
$txtLog.ReadOnly = $true
$txtLog.ScrollBars = 'Vertical'
$txtLog.WordWrap = $false
$txtLog.BackColor = [System.Drawing.Color]::White
$txtLog.ForeColor = [System.Drawing.Color]::Black
$txtLog.Location = New-Object System.Drawing.Point(16, 214)
$txtLog.Size = New-Object System.Drawing.Size(742, 360)
$txtLog.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Bottom -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right
$form.Controls.Add($txtLog)

# 状态条
$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Text = '就绪'
$lblStatus.Location = New-Object System.Drawing.Point(16, 584)
$lblStatus.AutoSize = $true
$lblStatus.Anchor = [System.Windows.Forms.AnchorStyles]::Bottom -bor [System.Windows.Forms.AnchorStyles]::Left
$form.Controls.Add($lblStatus)

# ---------------- 打包逻辑 ----------------
$script:PackProcess = $null
$script:PackLogFile = $null
$script:LastLogPos = 0
$script:LastInstaller = $null
$script:PackTimer = $null

function Write-GuiLog {
  param([string]$Message)
  $txtLog.AppendText($Message + "`r`n")
}

function Read-LogIncrement {
  if (-not $script:PackLogFile) { return }
  if (-not (Test-Path -LiteralPath $script:PackLogFile)) { return }
  try {
    $fs = [System.IO.File]::Open($script:PackLogFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
      $fs.Seek($script:LastLogPos, [System.IO.SeekOrigin]::Begin) | Out-Null
      $sr = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8)
      $newText = $sr.ReadToEnd()
      $script:LastLogPos = $fs.Position
      $sr.Close()
      if ($newText) { $txtLog.AppendText($newText) }
    } finally { $fs.Close() }
  } catch { }
}

$btnPack.add_Click({
  if ($script:PackProcess -ne $null) {
    Write-GuiLog '>> 打包正在进行中，请等待完成...'
    return
  }
  $version = $txtVer.Text.Trim()
  if (-not $version) { [System.Windows.Forms.MessageBox]::Show('请填写版本号', '提示') | Out-Null; return }
  if ($version -match '\s') { [System.Windows.Forms.MessageBox]::Show('版本号不能包含空格', '提示') | Out-Null; return }
  $out = $txtOut.Text.Trim()
  if (-not $out) { [System.Windows.Forms.MessageBox]::Show('请填写输出目录', '提示') | Out-Null; return }
  $retry = 8
  try { $retry = [int]$txtRetry.Text } catch { }
  if ($retry -lt 1) { $retry = 1 }
  $store = ''
  if ($chkStore.Checked) { $store = $txtStore.Text.Trim() }

  $btnPack.Enabled = $false
  $btnOpen.Enabled = $false
  $txtLog.Clear()
  $script:LastLogPos = 0

  Write-GuiLog ("== DeepSeek Harness 打包开始 " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + " ==")
  Write-GuiLog "版本: $version"
  Write-GuiLog "输出目录: $out"
  Write-GuiLog "构建重试: $retry 次（rolldown 偶发写入失败时自动重试）"
  if ($chkSkipBuild.Checked) { Write-GuiLog '选项: 跳过构建（复用已有产物）' }
  if ($chkNoClean.Checked) { Write-GuiLog '选项: 不清理输出目录' }
  if ($store) { Write-GuiLog "pnpm store: $store" }
  Write-GuiLog ''

  $logFile = Join-Path $env:TEMP ("dsh-pack-gui-" + [guid]::NewGuid().ToString('N') + ".log")
  $consoleFile = $logFile + '.console'

  $args = "-NoProfile -ExecutionPolicy Bypass -File `"$pkgV2`" -Version `"$version`" -OutputDirectory `"$out`" -BuildRetries $retry -LogFile `"$logFile`""
  if ($store) { $args += " -StoreDir `"$store`"" }
  if ($chkSkipBuild.Checked) { $args += ' -SkipBuild' }
  if ($chkNoClean.Checked) { $args += ' -NoClean' }
  $args += " *> `"$consoleFile`""

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'powershell.exe'
  $psi.Arguments = $args
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.WorkingDirectory = $repoRoot
  try {
    $script:PackProcess = [System.Diagnostics.Process]::Start($psi)
  } catch {
    Write-GuiLog "启动打包失败: $($_.Exception.Message)"
    $btnPack.Enabled = $true
    return
  }
  $script:PackLogFile = $logFile
  $lblStatus.Text = '打包中...'

  # Timer 必须放在 $script: 作用域，否则 Tick 回调跨作用域捕获不到它而变 $null，
  # 调用 $timer.Stop() 时会抛 "不能对 Null 值表达式调用方法"。
  $script:PackTimer = New-Object System.Windows.Forms.Timer
  $script:PackTimer.Interval = 500
  $script:PackTimer.add_Tick({
    Read-LogIncrement
    if ($script:PackProcess -and $script:PackProcess.HasExited) {
      $code = $script:PackProcess.ExitCode
      if ($script:PackTimer) { $script:PackTimer.Stop() }
      $script:PackTimer = $null
      $script:PackProcess = $null
      $btnPack.Enabled = $true
      $lblStatus.Text = '完成'

      Read-LogIncrement
      $installer = $null
      if (Test-Path -LiteralPath $script:PackLogFile) {
        $content = [System.IO.File]::ReadAllText($script:PackLogFile, [System.Text.Encoding]::UTF8)
        $m = [regex]::Match($content, 'INSTALLER=(.+)')
        if ($m.Success) { $installer = $m.Groups[1].Value.Trim() }
      }
      Write-GuiLog ''
      if ($code -eq 0) {
        Write-GuiLog '>> 打包成功!'
        if ($installer) {
          Write-GuiLog ">> 安装包: $installer"
          $script:LastInstaller = $installer
        } else {
          Write-GuiLog ">> 产物目录: $out"
          $script:LastInstaller = $null
        }
      } else {
        Write-GuiLog ">> 打包失败（退出码 $code），请查看上方日志。"
        $script:LastInstaller = $null
      }
      $btnOpen.Enabled = $true
    }
  })
  $script:PackTimer.Start()
})

$btnOpen.add_Click({
  $target = $null
  if ($script:LastInstaller -and (Test-Path -LiteralPath $script:LastInstaller)) {
    $target = Split-Path -Parent $script:LastInstaller
  } else {
    $out = $txtOut.Text.Trim()
    $cand = Join-Path $repoRoot $out
    if (Test-Path -LiteralPath $cand) { $target = $cand }
  }
  if ($target) { Start-Process explorer.exe $target } else { [System.Windows.Forms.MessageBox]::Show('产物目录尚不存在', '提示') | Out-Null }
})

$form.add_FormClosing({
  if ($script:PackProcess -ne $null) {
    $r = [System.Windows.Forms.MessageBox]::Show('打包正在进行中，关闭窗口不会停止打包进程。确定关闭?', '确认', [System.Windows.Forms.MessageBoxButtons]::YesNo)
    if ($r -eq [System.Windows.Forms.DialogResult]::No) { $_.Cancel = $true }
  }
})

[System.Windows.Forms.Application]::Run($form)
