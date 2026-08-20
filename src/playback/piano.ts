/**
 * The piano the keyboard sounds.
 *
 * Rendered with the project's own tone writer rather than built out of
 * oscillator and gain nodes, for the reason the metronome gives: one place in
 * the codebase decides what a synthesised note sounds like. What is left here is
 * the part that has to be a browser's business — when a context may be made, not
 * rendering the same note twice, and stopping what is already sounding.
 *
 * Every note is a *voice*: a buffer, a gain to fade it with, and a handle to
 * hold on to. That last part is the whole design. A fire-and-forget
 * `source.start()` cannot be taken back, so notes could only ever pile up —
 * pitching a phrase quickly left five or six full-length tails ringing at once,
 * which is what a room sounds like. A voice can be damped, which is what the
 * felts on a real piano are for.
 *
 * It is also the shape the next thing needs. Playing back a transcription
 * against the video wants notes started at a time rather than now, each damped
 * at its own written end, and all of them droppable the instant the video is
 * paused or scrubbed. Those are `voice()`, `release()` and `silence()` — the
 * same three pieces, given times instead of "now".
 */

import { frequencyOfMidi } from "../music/pitch.js";
import { pianoToneSeconds, writePianoTone } from "../music/synthesis.js";

/**
 * A note to sound at a moment and let go at another, in **video seconds**.
 *
 * The same shape `soundingNotes` produces, which measures in whole notes
 * instead — the tempo map is what turns one into the other, and `playback.ts`
 * is the one place that does it.
 */
export type PianoNote = {
  readonly start: number;
  readonly end: number;
  readonly midi: number;
};

/** Where a note falls on the audio clock, and how much of it is left to play. */
export type VoiceTiming = {
  /** When it starts, on the audio clock. */
  readonly at: number;
  /** How far into the rendered tone to begin, in seconds. */
  readonly offset: number;
  /** When to let it go, on the audio clock. */
  readonly until: number;
};

/**
 * Turn one note of video into one note of sound.
 *
 * Two mappings, and the rate is in both. The *wait* is video seconds converted
 * to wall seconds — at half speed a note a beat away is two beats of waiting —
 * and the *length* likewise, which is why a note held through a slow passage
 * rings for longer. The tone itself is never stretched: it is rendered in real
 * time and played at its own speed, so the pitch does not follow the video's.
 *
 * A note whose start has gone is not dropped if it is still sounding. A click is
 * an instant and cannot be played late, but a note is a duration, and one under
 * way can be joined part-way through by beginning that far into the tone —
 * which is what is heard when the piano is switched on mid-phrase, and what
 * keeps the note under a section's start mark from being lost to the seek that
 * gets there.
 *
 * It is joined however late it is, and never struck afresh. Striking it would
 * put the attack back, which is tempting: a seek settles a few milliseconds past
 * its mark, a loop wrap lands two hundred past it, and what comes out either way
 * is a headless stump. But an attack is a *rhythmic event*, and one sounded late
 * is an onset the music does not have. The note would read as beginning where it
 * did not, and the note after it — lined up correctly, with a horizon's worth of
 * warning — would then arrive too soon behind it, so the error spreads into a
 * phrase that was otherwise right. Coming in honestly on the tail leaves every
 * onset where the score put it. The lag belongs to the video, and it is better
 * admitted than papered over.
 *
 * Either way the note is let go at its **written end**, so what is heard is what
 * is left of it rather than a fresh copy of all of it.
 *
 * `undefined` for a note that is over, and for one with no length to it.
 */
export function voiceTiming(
  note: PianoNote,
  videoNow: number,
  rate: number,
  audioNow: number,
): VoiceTiming | undefined {
  if (note.end <= note.start) return undefined;
  // Hoisted above the two paths below because it disqualifies a note whichever
  // it would have taken. It can only ever be true of one already begun: a note
  // still to come ends after it starts, which is at or after `videoNow`.
  if (note.end <= videoNow) return undefined;

  const ahead = note.start - videoNow;
  if (ahead >= 0) {
    const at = audioNow + ahead / rate;
    return { at, offset: 0, until: at + (note.end - note.start) / rate };
  }

  return {
    at: audioNow,
    offset: -ahead / rate,
    until: audioNow + (note.end - videoNow) / rate,
  };
}

export type Piano = {
  /**
   * Sound this key now, damping whatever the last press left ringing.
   *
   * One note at a time, because this is a keyboard being used to find a pitch
   * rather than to play a chord: the note before it is what would be in the way.
   */
  play(midi: number): void;
  /**
   * Line these notes up against the video's clock.
   *
   * `videoNow` is where the video had got to when they were worked out and
   * `rate` how fast it is running, which is all it takes to turn a moment of
   * video time into a moment of the audio clock. The same two arguments the
   * metronome takes, for the same reason.
   *
   * Unlike `play`, nothing is damped to make room: a melody's notes are damped
   * by their own written ends, which is what keeps a run of them from piling
   * into each other. A note handed over after it has begun is joined part-way
   * through rather than dropped — see `voiceTiming`.
   */
  schedule(notes: readonly PianoNote[], videoNow: number, rate: number): void;
  /**
   * The video has moved; take the notes out with it.
   *
   * Every voice the new reading has left behind is dropped. A voice the reading
   * is still *inside* is the same note it was a moment ago, so it keeps
   * ringing, with its damping asked again from where the video now stands.
   *
   * That distinction is the whole point. A seek arrives as two or three
   * separate discontinuities, and the player's clock also slips backwards by a
   * few tens of milliseconds of its own accord shortly after any resume — which
   * is indistinguishable from a small seek. Dropping everything on each of those
   * silenced a note that was sounding perfectly well, and took it up again a
   * moment later two hundred milliseconds down its own tone. Nothing about the
   * note had changed, so now nothing happens to it.
   *
   * Returns whether a note survived, which is what tells the caller the note
   * under the new reading is already sounding and is owed nothing.
   */
  relocate(videoNow: number, rate: number): boolean;
  /**
   * Have a tone ready for every pitch these notes use.
   *
   * Writing one is tens of milliseconds of arithmetic, and `schedule` cannot
   * afford it: the note that most needs to be on time — the one under a
   * section's start mark, taken up the moment a loop wraps — is the one with the
   * least warning, and a tone written on that path is time the note is late by.
   *
   * Rendered a pitch at a time with a yield between, because this is called on
   * every edit and a keystroke must not stop for the better part of a second
   * while a melody's worth of tones are written. Nothing depends on it having
   * finished: `schedule` still writes what it needs, this only means it
   * usually does not have to.
   */
  prepare(notes: readonly PianoNote[]): void;
  /** Drop everything sounding or lined up, at once. */
  silence(): void;
  close(): void;
};

/**
 * How many rendered notes to keep for the keyboard.
 *
 * A note is a couple of seconds of mono float samples — a few hundred kilobytes
 * — so the whole clef's range held at once would be tens of megabytes for a
 * convenience. Two octaves' worth covers the going back and forth of pitching a
 * phrase, and anything past that is quick enough to render again.
 *
 * This is a policy for a range being *roamed over*, and it is why the melody's
 * pitches are held apart from it rather than in it. They are a fixed, known,
 * finite set, and eviction is the last thing wanted of them — worse, the rule
 * below is insertion-order, so a melody wider than this would evict the pitches
 * it rendered first, which are exactly the ones at the head of the section that
 * a loop returns to.
 */
const KEPT = 24;

/**
 * How long a damped note takes to fall silent, in seconds.
 *
 * Long enough not to click, short enough that the note replacing it is heard on
 * its own. A piano damper is about this quick.
 */
const RELEASE_SECONDS = 0.14;

/** A note that is sounding or lined up, and the gain that can take it away. */
type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** When it starts on the audio clock — a scheduled note has not yet. */
  startedAt: number;
  /**
   * The written note this is, when it is one.
   *
   * Absent for a key pressed on the keyboard, which stands at no point in any
   * melody. Present for a scheduled note, so that when the video moves the
   * piano can tell which of the notes it has out are still the right notes.
   */
  note?: PianoNote;
};

export function createPiano(): Piano {
  // Made on the first press, never before: a browser will not let a page make a
  // sound until the user has asked for one, and a context made anywhere else
  // arrives suspended and stays that way. The same rule `createMetronome`
  // follows, except that this one cannot be made when its owner is built —
  // building the editor is not a gesture.
  let context: AudioContext | undefined;
  /** The keyboard's cache: a range being roamed over, so capped and evicted. */
  const rendered = new Map<number, AudioBuffer>();
  /** The melody's: a known set, pinned, and replaced whole when it changes. */
  const prepared = new Map<number, AudioBuffer>();
  /** Pitches `prepare` still owes, and the timer working through them. */
  let owed: number[] = [];
  let writing: ReturnType<typeof setTimeout> | undefined;
  let sounding: Voice[] = [];

  /** Write the tone itself. Tens of milliseconds; the reason for the caches. */
  function renderTone(midi: number, ctx: AudioContext): AudioBuffer {
    const frequency = frequencyOfMidi(midi);
    const seconds = pianoToneSeconds(frequency);
    const buffer = ctx.createBuffer(
      1,
      Math.ceil(seconds * ctx.sampleRate),
      ctx.sampleRate,
    );
    const samples = new Float32Array(buffer.length);
    writePianoTone(samples, 0, frequency, seconds, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);
    return buffer;
  }

  function bufferFor(midi: number, ctx: AudioContext): AudioBuffer {
    // The melody's own pitches first: they are pinned, and looking here first
    // is what keeps the keyboard's eviction rule from reaching them.
    const pinned = prepared.get(midi);
    if (pinned) return pinned;
    const kept = rendered.get(midi);
    if (kept) return kept;

    const buffer = renderTone(midi, ctx);

    // Oldest out first, which for this is also least recently asked for: a
    // note played again is served from the map without being re-inserted, and
    // the notes being worked on are the ones being played.
    if (rendered.size >= KEPT) {
      const oldest = rendered.keys().next();
      if (!oldest.done) rendered.delete(oldest.value);
    }
    rendered.set(midi, buffer);
    return buffer;
  }

  /** One owed pitch, then hand the thread back. */
  function writeOwed(): void {
    writing = undefined;
    const midi = owed.shift();
    if (midi === undefined) return;
    if (!prepared.has(midi)) {
      const ctx = waking();
      prepared.set(midi, rendered.get(midi) ?? renderTone(midi, ctx));
    }
    if (owed.length > 0) writing = setTimeout(writeOwed, 0);
  }

  /**
   * Start a note, at `when` on the audio clock.
   *
   * `offset` begins that far into the tone rather than at its head, which is
   * how a note already under way is joined: the attack has been and gone, and
   * what is left is the decay it would be in the middle of.
   */
  function voice(
    midi: number,
    ctx: AudioContext,
    when: number,
    offset = 0,
    note?: PianoNote,
  ): Voice {
    const source = ctx.createBufferSource();
    source.buffer = bufferFor(midi, ctx);

    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);

    const started: Voice = { source, gain, startedAt: when, note };
    source.addEventListener("ended", () => {
      sounding = sounding.filter((other) => other !== started);
      gain.disconnect();
    });
    source.start(when, offset);
    return started;
  }

  /**
   * The context, made and woken on the way to making a sound.
   *
   * Never before: a browser will not let a page make a sound until the user has
   * asked for one, and a context made anywhere else arrives suspended and stays
   * that way. Every route into this file runs inside a press.
   */
  function waking(): AudioContext {
    context ??= new AudioContext();
    if (context.state === "suspended") {
      void context.resume();
    }
    return context;
  }

  /** Drop a voice at once, whether or not it has begun. */
  function drop(other: Voice, now: number): void {
    // Anything lined up for a future that is no longer coming is stopped
    // outright rather than faded: there is nothing to fade from until it
    // starts, and a ramp scheduled before its own source would let it sound at
    // full volume when its moment arrived.
    if (other.startedAt > now) {
      try {
        other.source.stop(now);
      } catch {
        // Never started and never will; nothing to take back.
      }
      other.gain.disconnect();
      return;
    }
    release(other, now);
  }

  /** Fade a voice out and stop it, the way a damper falls on a string. */
  function release({ source, gain }: Voice, at: number): void {
    const until = at + RELEASE_SECONDS;
    // Cancelled first, or a ramp already scheduled would go on fighting this
    // one. `setValueAtTime` pins where the fade starts from, since an
    // exponential ramp needs somewhere to begin.
    gain.gain.cancelScheduledValues(at);
    gain.gain.setValueAtTime(gain.gain.value, at);
    // Linear rather than exponential: an exponential ramp cannot reach zero,
    // and the tail being cut is already quiet.
    gain.gain.linearRampToValueAtTime(0, until);
    try {
      source.stop(until);
    } catch {
      // Already finished on its own, which is the ordinary case for a note left
      // to ring out.
    }
  }

  return {
    play(midi) {
      const ctx = waking();
      const now = ctx.currentTime;
      for (const other of sounding) {
        release(other, now);
      }
      sounding = [voice(midi, ctx, now)];
    },

    schedule(notes, videoNow, rate) {
      if (notes.length === 0) return;
      const ctx = waking();

      // Written first, and the clock read after. A tone is tens of milliseconds
      // of arithmetic, so a clock read before it has gone stale by the time
      // anything is started — and a note started against a stale clock is
      // damped at the end it *would* have had, which takes the difference out
      // of the note rather than off the front of it. Short enough and the
      // damping is already in the past, the gain is at zero before the note
      // begins, and nothing is heard at all.
      const before = ctx.currentTime;
      for (const note of notes) bufferFor(note.midi, ctx);
      const audioNow = ctx.currentTime;
      // Whatever that cost, the video spent it moving. Advancing the reading by
      // the same amount is what keeps the pair honest: the clock alone would
      // make every note in the batch late by the writing time instead.
      const movedOn = videoNow + (audioNow - before) * rate;

      for (const note of notes) {
        const timing = voiceTiming(note, movedOn, rate, audioNow);
        // Nothing left of it: over before this window opened, or written with
        // no length at all.
        if (!timing) continue;

        const started = voice(note.midi, ctx, timing.at, timing.offset, note);
        sounding.push(started);
        // Damped at its own written end, so the melody's own rhythm decides how
        // long each note rings rather than the buffer's full decay.
        release(started, timing.until);
      }
    },

    prepare(notes) {
      // Replaced whole rather than added to, so the pitches of a melody that
      // has been edited away are let go of rather than held for the session.
      const wanted = new Set(notes.map((note) => note.midi));
      for (const midi of [...prepared.keys()]) {
        if (!wanted.has(midi)) prepared.delete(midi);
      }
      owed = [...wanted].filter((midi) => !prepared.has(midi));
      // Already at work, and the queue it is working through has just been
      // replaced — which is the point, since the melody it was writing for is
      // no longer the melody.
      if (owed.length > 0 && writing === undefined) {
        writing = setTimeout(writeOwed, 0);
      }
    },

    relocate(videoNow, rate) {
      if (!context) return false;
      const now = context.currentTime;
      const keeping: Voice[] = [];

      for (const other of sounding) {
        const note = other.note;
        const inside =
          note !== undefined &&
          other.startedAt <= now &&
          note.start < videoNow &&
          videoNow < note.end;
        if (!inside) {
          drop(other, now);
          continue;
        }
        // Still the right note, so it is left ringing — but its damping was
        // worked out against the reading the video has just left, so it is
        // asked again from the reading it has arrived at.
        // Cancelled from *now*, not from the new damping time: the ramp that
        // is being replaced starts earlier than that, and `release` only
        // cancels from the moment it is given.
        other.gain.gain.cancelScheduledValues(now);
        // `release` re-arms `source.stop` as well as the fade, and the last
        // call to `stop` is the one that counts, so it carries the extension.
        release(other, now + (note.end - videoNow) / rate);
        keeping.push(other);
      }

      sounding = keeping;
      return keeping.length > 0;
    },

    silence() {
      if (!context) return;
      const now = context.currentTime;
      for (const other of sounding) {
        drop(other, now);
      }
      sounding = [];
    },

    close() {
      sounding = [];
      rendered.clear();
      prepared.clear();
      owed = [];
      if (writing !== undefined) clearTimeout(writing);
      writing = undefined;
      void context?.close();
      context = undefined;
    },
  };
}
