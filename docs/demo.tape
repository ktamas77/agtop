# vhs tape for the agentop demo GIF.  Regenerate with:  vhs docs/demo.tape
Output docs/demo.gif

Set Shell bash
Set FontSize 16
Set Width 1200
Set Height 500
Set Padding 18
Set Theme "Catppuccin Mocha"
Set CursorBlink false

# Define a hidden `agentop` shim so the visible command is clean.
Hide
Type 'agentop() { node /Users/tamaskalman/dev/ktamas77/atop/bin/agentop.js "$@"; }'
Enter
Type 'clear'
Enter
Show

# Launch the live dashboard (fabricated sample agents).
Type "agentop --demo"
Enter
Sleep 5s

# Cycle the sort column a couple of times.
Type "s"
Sleep 2s
Type "s"
Sleep 2s

# Reverse the order.
Type "r"
Sleep 2500ms

# Let it tick once more, then quit.
Sleep 2s
Type "q"
Sleep 500ms
