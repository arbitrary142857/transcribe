/**
 * What the button that ends a sitting in the editor says, and whether it works.
 *
 * One button for two things, because they are the same thing to the person
 * pressing it: leaving. With work owed it saves and then leaves; with nothing
 * owed it simply leaves, and says so — a button promising an exit that refuses
 * to give one is worse than no button. So the *only* thing that ever greys it
 * is a save that cannot go, and that can only be true when there is a save to
 * make.
 *
 * The two savings are named apart because they are not the same act: a first
 * save puts a whole transcription into the world, and every one after edits
 * the thing that is already there.
 *
 * Pure, and separate from the page, so the four readings can be checked
 * without a browser.
 */

export type SaveButtonFacts = {
  /** A save is out, and has not come back. */
  readonly saving: boolean;
  /** What is on the page is what is in the database. */
  readonly saved: boolean;
  /** There is a row for this already: a save would be an edit of it. */
  readonly stored: boolean;
  /** Why the save cannot go, or nothing if it can. */
  readonly problem?: string;
};

export type SaveButton = {
  readonly label: string;
  readonly disabled: boolean;
};

export function saveButton({
  saving,
  saved,
  stored,
  problem,
}: SaveButtonFacts): SaveButton {
  if (saving) return { label: "Saving…", disabled: true };
  if (saved) return { label: "Exit (No Changes)", disabled: false };
  return {
    label: stored ? "Save Changes and Exit" : "Save Transcription and Exit",
    disabled: problem !== undefined,
  };
}
