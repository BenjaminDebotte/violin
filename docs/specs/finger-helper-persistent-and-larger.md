# Spec: Persistent & Enlarged Finger Helper

Status: **Draft for Review**  
Target version: `0.3.3`

---

## 1. Objective

Violinists practicing from a music stand at 0.5–1.5m away need:
1. **Persistent Visibility**: The finger helper must stay active on screen across all notes as the piece progresses while playing, in both Wait-for-Me and Play-Along modes, until the user explicitly toggles it off.
2. **Larger Scale**: The fingerboard diagram, string spacing, finger dots, and text must be significantly larger and clearer to read effortlessly while playing the violin.

---

## 2. Commands

- **Build**: `npm run build`
- **Test**: `npm test -- --run`

---

## 3. Detailed Requirements

### 3.1 Persistent Finger Helper Mode
- When the user taps the Hand button (`Show finger placement`):
  - In **both** `wait-for-me` and `play-along` modes, it enables a sticky `followFingers` state.
  - The finger helper remains on screen continuously as notes change and bars progress.
  - On each new note, the finger helper immediately updates its finger placement text and fingerboard diagram for the new active target note.
  - It stays visible while playing until the user explicitly disables it (by clicking the Hand button again or clicking the `✕` close button on the hint).
- When sticky `followFingers` is off:
  - In `wait-for-me` mode, automatic stuck/wrong-note hints from the coach still appear as one-shot hints for the current note.

### 3.2 Enlarged Visual Presentation
- **Fingerboard Diagram**:
  - Increase SVG viewBox height from 50 to 76px.
  - String lines spaced ~15px apart instead of 10px.
  - String lines given heavier stroke widths (1.8px to 3.5px) for clear differentiation.
  - Prominent nut (46px high).
  - Open string indicators on the left (G, D, A, E) so the user doesn't have to guess string order.
  - Finger mark dots enlarged: radius increased from 7-9px to 13-15px with bold 12-13px numbers.
- **Position & String Descriptions**:
  - Increase font size from 14px to 16px font-extrabold.
  - Larger position pill badge (`1st` / `3rd`).
- **Container**:
  - More generous padding and clear visual grouping inside the feedback panel.

---

## 4. Acceptance Criteria

1. [ ] Tapping the Hand button in Wait-for-Me mode toggles persistent finger helper mode.
2. [ ] While playing in Wait-for-Me mode, advancing to subsequent notes keeps the finger helper open and updates to each new note's fingerings.
3. [ ] While playing in Play-Along mode, advancing to subsequent notes keeps the finger helper open and updates to each new note's fingerings.
4. [ ] Clicking the Hand button or the `✕` close button disables persistent mode and hides the hint.
5. [ ] The fingerboard diagram and finger marks are visually larger, with open string labels (G, D, A, E) and increased touch/visual target sizes.
6. [ ] All existing and new tests pass.
