# Regenerate: pnpm build && vhs assets/demo.tape (from the repo root; needs network)
Output assets/demo.gif

Set Shell zsh
Set FontSize 16
Set Width 1400
Set Height 700
Set Padding 20
Set TypingSpeed 60ms

Hide
Type "R=$PWD; export SKILLSET_HOME=/tmp/skillset-demo; skillset() { node $R/dist/bin.js $@ }" Enter
Type "rm -rf $SKILLSET_HOME /tmp/demo-project && mkdir -p /tmp/demo-project && cd /tmp/demo-project && clear" Enter
Show

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
Sleep 4s
