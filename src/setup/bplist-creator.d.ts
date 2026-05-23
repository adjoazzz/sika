declare module 'bplist-creator' {
  /**
   * Serialises a JavaScript object tree into a binary Apple Property List
   * (.plist / .shortcut) Buffer.
   */
  function bplistCreator(input: unknown): Buffer;
  export = bplistCreator;
}
