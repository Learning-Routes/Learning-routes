// The words of the lesson player (Platform STEP 12), one file per language. Data only. Spanish is
// the source; a locale missing a string fails the types and copy.test.

export interface PlayerText {
  close: string;
  askTutor: string;
  /** {n} is the beat's place, {total} how many the topic has. */
  beatOf: string;
  check: string;
  next: string;
  continue: string;
  retry: string;
  fix: string;
  seeAnswer: string;
  right: string;
  wrong: string;
  partly: string;
  /** {n} is the XP gained. */
  xpGained: string;
  loading: string;
  failed: string;
  pickOne: string;
  /** {n} is how many items are left to place. */
  placeLeft: string;
  placeHere: string;
  available: string;
  allPlaced: string;
  /** {n} of {total} pairs. */
  pairsOf: string;
  matchAll: string;
  hint: string;
  hideHint: string;
  trueLabel: string;
  falseLabel: string;
  yourEstimate: string;
  tapAPoint: string;
  stepOf: string;
  showStep: string;
  back: string;
  again: string;
  knewIt: string;
  flip: string;
  nowYou: string;
  listen: string;
  stop: string;
  slower: string;
  record: string;
  recordAgain: string;
  speakHint: string;
  /** The microphone button, before the learner speaks. */
  tapToSpeak: string;
  /** While the browser listens. */
  listening: string;
  saidRight: string;
  /** Some words were missed; they show in grey. */
  saidAlmost: string;
  /** What the browser wrote down: {heard}. */
  heardAs: string;
  heardNothing: string;
  /** This browser cannot listen; the learner can still go on. */
  noRecognition: string;
  /** Said once, near the button: the browser turns the voice into text to check it. */
  recognitionNote: string;
  runTests: string;
  /** {n} of {total} tests passed. */
  testsOf: string;
  sendAnswer: string;
  selfCheck: string;
  tryIt: string;
  module: string;
  /** {n} lessons of {total}. */
  lessonsOf: string;
  tutorTitle: string;
  tutorSub: string;
  topicDone: string;
  topicDoneBody: string;
  /** {n} is the score, {total} the number of questions. */
  scoreOf: string;
  /** Above how many were right the first time, at the end of a topic. */
  firstTry: string;
  xpTotal: string;
  nextTopic: string;
  backToRoute: string;
  routeDone: string;
  readAll: string;
  theme: string;
  missingGates: string;
  strum: string;
  clear: string;
  play: string;
  pause: string;
  takePhoto: string;
  monthly: string;
  willHave: string;
  youPut: string;
  interest: string;
  goalReached: string;
  /** {n} is what is missing. */
  goalMissing: string;
  voltage: string;
  resistance: string;
  pickPiece: string;
  pieceChosen: string;
  perMinute: string;
  inRhythm: string;
  rhythmHelp: string;
  on: string;
  off: string;
  slowerPlease: string;
  fasterPlease: string;
  keepIt: string;
  startTapping: string;
  yourAnswer: string;
  naturalness: string;
  colorBase: string;
  aperture: string;
  shutter: string;
  iso: string;
  apertureHelp: string;
  shutterHelp: string;
  isoHelp: string;
  atoms: string;
  leftSide: string;
  rightSide: string;
  element: string;
  tooBright: string;
  tooDark: string;
  blurry: string;
}
