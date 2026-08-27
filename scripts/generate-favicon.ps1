$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$size = 64
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(37, 99, 235))

$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$fold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(191, 219, 254))
$bluePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(37, 99, 235), 5)
$bluePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$bluePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$bluePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

$document = New-Object System.Drawing.Drawing2D.GraphicsPath
$document.AddPolygon([System.Drawing.Point[]]@(
  (New-Object System.Drawing.Point(15, 13)),
  (New-Object System.Drawing.Point(38, 13)),
  (New-Object System.Drawing.Point(47, 22)),
  (New-Object System.Drawing.Point(47, 53)),
  (New-Object System.Drawing.Point(15, 53))
))
$graphics.FillPath($white, $document)
$graphics.FillPolygon($fold, [System.Drawing.Point[]]@(
  (New-Object System.Drawing.Point(38, 13)),
  (New-Object System.Drawing.Point(38, 23)),
  (New-Object System.Drawing.Point(48, 23))
))
$graphics.DrawLines($bluePen, [System.Drawing.Point[]]@(
  (New-Object System.Drawing.Point(23, 36)),
  (New-Object System.Drawing.Point(29, 42)),
  (New-Object System.Drawing.Point(42, 27))
))

$pngStream = New-Object System.IO.MemoryStream
$bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $pngStream.ToArray()
$outputPath = Join-Path $PSScriptRoot "../apps/web/public/favicon.ico"
$fileStream = [System.IO.File]::Create($outputPath)
$writer = New-Object System.IO.BinaryWriter($fileStream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]1)
$writer.Write([byte]$size)
$writer.Write([byte]$size)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]$pngBytes.Length)
$writer.Write([uint32]22)
$writer.Write($pngBytes)
$writer.Dispose()

$bluePen.Dispose()
$fold.Dispose()
$white.Dispose()
$document.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$pngStream.Dispose()

Write-Output "Favicon generated at $outputPath"
