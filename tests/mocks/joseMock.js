module.exports = {
  FlattenedSign: class {
    constructor() {}
    setProtectedHeader() { return this; }
    setUnprotectedHeader() { return this; }
    async sign() { return { payload: '', signatures: [] }; }
  },
  flattenedVerify: async () => ({ payload: new Uint8Array() }),
  compactDecrypt: async () => ({}),
  compactVerify: async () => ({})
};
