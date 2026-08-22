/**
 * A name for an account that has none.
 *
 * Nobody is made to choose a username: one is minted at sign-in, so the
 * corner of every page shows a name from the first moment and usernames are
 * self-evidently a thing, and the profile page is where it is changed. Two
 * ordinary words and a hyphen — `quiet-heron` — which reads as a name
 * rather than as an id, and a number when that pair is already somebody's.
 *
 * The words are plain, lowercase and ASCII, none of them reserved and none
 * unkind, and every pairing passes `usernameProblem`; a test walks the whole
 * product to prove it. The random choice is handed in, so a test can say
 * which name it expects and the Worker can use its own randomness.
 */

export const ADJECTIVES: readonly string[] = [
  "amber", "autumn", "bold", "brave", "bright", "brisk", "calm", "cedar",
  "clear", "clever", "cloudy", "cobalt", "cool", "copper", "coral", "crisp",
  "curious", "dusky", "early", "eager", "easy", "even", "fair", "fleet",
  "fond", "free", "fresh", "frosty", "gentle", "glad", "golden", "grand",
  "green", "happy", "hazel", "honest", "humble", "idle", "ivory", "jolly",
  "keen", "kind", "late", "light", "lively", "lucky", "lunar", "marble",
  "mellow", "merry", "mild", "misty", "modest", "mossy", "neat", "nimble",
  "noble", "olive", "pale", "patient", "plain", "polite", "proud", "quick",
  "quiet", "rapid", "ready", "rosy", "royal", "rustic", "sandy", "scarlet",
  "sharp", "silent", "silver", "simple", "sleepy", "slow", "small", "smooth",
  "snowy", "soft", "solar", "steady", "still", "stormy", "sunny", "swift",
  "tender", "tidy", "tiny", "true", "velvet", "violet", "vivid", "warm",
  "wild", "windy", "wise", "young",
];

export const NOUNS: readonly string[] = [
  "aspen", "badger", "beacon", "birch", "bison", "brook", "canyon", "cedar",
  "cliff", "cloud", "comet", "coral", "crane", "creek", "crow", "dawn",
  "delta", "dune", "eagle", "ember", "falcon", "fern", "finch", "fjord",
  "forest", "fox", "garden", "glacier", "grove", "harbor", "hawk", "heron",
  "hill", "ibis", "island", "jade", "juniper", "kestrel", "lagoon", "lake",
  "lantern", "lark", "lily", "linnet", "lotus", "lynx", "maple", "marsh",
  "meadow", "mesa", "moon", "moss", "moth", "oak", "ocean", "orchid",
  "osprey", "otter", "owl", "pebble", "pine", "plover", "pond", "prairie",
  "quail", "quartz", "raven", "reed", "ridge", "river", "robin", "sage",
  "sail", "shore", "sparrow", "spruce", "star", "stone", "storm", "summit",
  "swan", "swift", "thrush", "tide", "trail", "tundra", "valley", "vale",
  "walnut", "wave", "willow", "wren",
];

/**
 * A name, for the `attempt`-th try at one.
 *
 * `pick(n)` answers a whole number below `n`. The first try is the pair
 * alone; from the second on a number is added, starting at two, which is
 * what makes each try a different name from the last when the pair itself
 * is what was taken.
 */
export function mintName(pick: (n: number) => number, attempt: number): string {
  const adjective = ADJECTIVES[pick(ADJECTIVES.length)] ?? ADJECTIVES[0]!;
  const noun = NOUNS[pick(NOUNS.length)] ?? NOUNS[0]!;
  const pair = `${adjective}-${noun}`;
  return attempt === 0 ? pair : `${pair}-${attempt + 1}`;
}
