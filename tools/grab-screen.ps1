# Screen-grab helper for the deck screenshots.
#
# The in-app browser pane renders the live, signed-in site but its screenshot
# tool hands images back to the model rather than writing files, and it exposes
# no CDP port. So we capture the desktop and crop to the pane instead.
#
#   .\grab-screen.ps1 -Out full.png                       # whole virtual desktop
#   .\grab-screen.ps1 -Out shot.png -X 900 -Y 120 -W 1280 -H 720   # cropped
# X/Y default to [int]::MinValue rather than -1: a monitor to the LEFT of the
# primary has negative virtual coordinates, so -1331 is a real position, not a
# request for the whole desktop. Treating any negative as "unset" silently
# captured the wrong screen.
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$X = [int]::MinValue, [int]$Y = [int]::MinValue, [int]$W = 0, [int]$H = 0
)

Add-Type -AssemblyName System.Drawing, System.Windows.Forms

$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
if ($X -eq [int]::MinValue) { $X = $vs.X }
if ($Y -eq [int]::MinValue) { $Y = $vs.Y }
if ($W -le 0) { $W = $vs.Width }
if ($H -le 0) { $H = $vs.Height }

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($X, $Y, 0, 0, (New-Object System.Drawing.Size($W, $H)))

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose(); $bmp.Dispose()
"saved $Out  ${W}x${H} from ($X,$Y)"
