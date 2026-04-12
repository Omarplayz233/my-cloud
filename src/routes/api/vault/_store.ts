export type VaultFile = {
  id: string;
  name: string;
  size: number;
  createdAt: number;

  salt: string;
  iv: string;
  hash: string;

  chunks: {
    index: number;
    size: number;
    file_id: string;
  }[];
};

const store = {
  unlocked: false,
  key: null as CryptoKey | null,
  files: [] as VaultFile[]
};

export default store;
