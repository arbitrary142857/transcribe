import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { saveButton } from "../dist/ui/save-button.js";

describe("saveButton()", () => {
  it("offers to save the whole thing when there is no row for it yet", () => {
    assert.deepEqual(saveButton({ saving: false, saved: false, stored: false }), {
      label: "Save Transcription and Exit",
      disabled: false,
    });
  });

  it("offers to save the changes when there is a row to change", () => {
    assert.deepEqual(saveButton({ saving: false, saved: false, stored: true }), {
      label: "Save Changes and Exit",
      disabled: false,
    });
  });

  it("offers the way out alone when everything is already in the database", () => {
    assert.deepEqual(saveButton({ saving: false, saved: true, stored: true }), {
      label: "Exit (No Changes)",
      disabled: false,
    });
  });

  it("greys the save out while something stands in its way, whichever save it is", () => {
    assert.deepEqual(
      saveButton({
        saving: false,
        saved: false,
        stored: false,
        problem: "A title is needed.",
      }),
      { label: "Save Transcription and Exit", disabled: true },
    );
    assert.deepEqual(
      saveButton({
        saving: false,
        saved: false,
        stored: true,
        problem: "A title is needed.",
      }),
      { label: "Save Changes and Exit", disabled: true },
    );
  });

  it("still lets a saved page be left, whatever a fresh problem says", () => {
    // Nothing is owed, so nothing can go wrong sending it: a title emptied
    // and typed back would otherwise trap the visitor on the page.
    assert.deepEqual(
      saveButton({
        saving: false,
        saved: true,
        stored: true,
        problem: "A title is needed.",
      }),
      { label: "Exit (No Changes)", disabled: false },
    );
  });

  it("says what it is doing while the save is out, and takes no second press", () => {
    // Which is also the last thing seen on the way out: the page freezes the
    // panel here rather than repainting into a reading nobody can act on.
    assert.deepEqual(saveButton({ saving: true, saved: false, stored: false }), {
      label: "Saving…",
      disabled: true,
    });
    assert.deepEqual(saveButton({ saving: true, saved: true, stored: true }), {
      label: "Saving…",
      disabled: true,
    });
  });
});
