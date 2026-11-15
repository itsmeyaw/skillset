# Shared theme and steps; sourced by assets/demo.tape and assets/*/demo.tape, which set Output and sizes.
Set Shell zsh
Set FontFamily "JetBrains Mono"
Set Framerate 30
Set TypingSpeed 70ms
Set CursorBlink false
Set Theme { "name": "skillset", "background": "#0D1E45", "foreground": "#DCE6FF", "cursor": "#5C8DFF", "selection": "#24407D", "black": "#0A1838", "red": "#FF7A90", "green": "#5FD3A0", "yellow": "#FFD479", "blue": "#5C8DFF", "magenta": "#B5A8FF", "cyan": "#7FC8FF", "white": "#DCE6FF", "brightBlack": "#6F84AE", "brightRed": "#FF7A90", "brightGreen": "#5FD3A0", "brightYellow": "#FFD479", "brightBlue": "#8FB0FF", "brightMagenta": "#B5A8FF", "brightCyan": "#7FC8FF", "brightWhite": "#F2F6FF" }

Hide
Type "R=$PWD; export SKILLSET_HOME=/tmp/skillset-demo; skillset() { node $R/dist/bin.js $@ }; PROMPT='%F{blue}$%f '" Enter
Type "rm -rf $SKILLSET_HOME /tmp/some-project && mkdir -p /tmp/some-project && cd /tmp/some-project && clear" Enter
Sleep 500ms
Show

Sleep 800ms
Type "skillset add --set my-set" Enter
Sleep 2s
Type "mattpocock/skills" Enter
Sleep 6s
Type "grill"
Sleep 1s
Space
Sleep 500ms
Backspace 5
Type "tdd"
Sleep 1s
Space
Sleep 1s
Enter
Sleep 2s
Type "n"
Sleep 1s
Type "y"
Sleep 3s
Enter
Sleep 2s
Enter
Sleep 2s
Enter
Sleep 2s
Enter
Sleep 2s
Enter
Sleep 10s

Type "ls .agents/skills"
Enter
Sleep 7s
