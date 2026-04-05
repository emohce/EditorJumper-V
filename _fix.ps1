$f = Join-Path $PSScriptRoot "src\configPanel.js"
$c = [System.IO.File]::ReadAllText($f)
$bt = [char]96
$idx = $c.IndexOf("</html>")
$after = ""
if ($idx -ge 0) {
    $after = $c.Substring($idx + 7, 10)
    $codes = @()
    foreach ($ch in $after.ToCharArray()) { $codes += [int]$ch }
    $debug = "idx=$idx codes=$($codes -join ',')"
} else {
    $debug = "not found"
}

# Pattern: </html> followed by CR LF } ;
$oldCRLF = "</html>`r`n};"
$newCRLF = "</html>" + $bt + ";`r`n}"
$oldLF = "</html>`n};"
$newLF = "</html>" + $bt + ";`n}"

if ($c.Contains("</html>`r`n};")) {
    $c = $c.Replace("</html>`r`n};", "</html>" + $bt + ";`r`n}")
    [System.IO.File]::WriteAllText($f, $c)
    $debug += " FIXED_CRLF"
} elseif ($c.Contains("</html>`n};")) {
    $c = $c.Replace("</html>`n};", "</html>" + $bt + ";`n}")
    [System.IO.File]::WriteAllText($f, $c)
    $debug += " FIXED_LF"
} else {
    $debug += " NO_MATCH"
}

$resultPath = Join-Path $PSScriptRoot "_fix_result.txt"
[System.IO.File]::WriteAllText($resultPath, $debug)
