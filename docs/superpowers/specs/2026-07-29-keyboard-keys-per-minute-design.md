# Keyboard Keys-Per-Minute Design

## Goal

Replace the simulated keyboard's WPM estimate with a direct rolling count of physical key presses during the most recent 60 seconds.

## Behavior

- The rate label displays `<count> 键/分` instead of WPM.
- The count includes every accepted physical key event, including Space, Enter, Backspace, and modifier keys.
- The existing top-five key ranking remains unchanged.
- The rate uses a rolling 60-second window rather than projecting from a shorter sample or averaging the full Pomodoro round.
- While the keyboard panel is visible, the rate refreshes once per second so it falls naturally to zero after typing stops.
- Suspending or hiding the keyboard panel stops the refresh timer. Resuming the panel refreshes immediately and restarts the timer without resetting the current round.
- Starting a new Pomodoro work round resets the total count, key ranking, and rolling rate as it does today.

## Privacy

The implementation continues to retain only physical key codes and event timestamps in memory. It does not capture typed text, inspect input values, persist typing statistics, or send them over the network.

## Implementation

- Add a pure rolling-window calculation to `src/logic.js` so boundary behavior can be tested independently.
- Update `src/keyboard.js` to use the 60-second calculation and manage one refresh timer while visible.
- Rename the WPM display element in `src/index.html` to reflect the new keys-per-minute meaning.
- Extend the existing JavaScript logic tests; no new test file is needed.

## Acceptance Criteria

1. A key press less than 60 seconds old contributes one unit to the displayed rate.
2. A key press 60 seconds old or older does not contribute.
3. The display reads `0 键/分` with no recent input.
4. The value updates without requiring another key press.
5. Existing total-key, top-five, listener fallback, suspend/resume, and Pomodoro reset behavior remain unchanged.
