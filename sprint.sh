#!/bin/sh
open_this_tab() {
    rand_string=$(openssl rand -base64 12)
    echo $rand_string
    osascript -e 'tell application "Terminal"
        set allWindows to number of windows

        repeat with i from 1 to allWindows
            set allTabs to number of tabs of window i
            repeat with j from 1 to allTabs
                if contents of tab j of window i contains '"\"$rand_string\""' then
                    set frontmost of window i to true
                    set selected of tab j of window i to true
                end if
            end repeat
        end repeat
        end tell'
    open -a Terminal
}
theday=$(date +"%Y-%m-%d")
thetime=$(date +"%I:%M %p")
themessage="$thetime Sprinting for $1 seconds on $2"
echo $theday $themessage >> log.txt
echo $theday $themessage
say $themessage
sleep $1
echo "Sprint on $2 complete!"
say "Sprint on $2 complete!"

osascript -e 'activate application "Finder"
tell application "System Events"
    set visible of processes where name is not "Finder" to false
end tell
tell application "Finder" to set collapsed of windows to true'
open_this_tab
sleep 2
say "Hands off the keyboard buddy"
