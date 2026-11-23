import { Vault } from './vault';

/** Vault with write operations (filled in by later phases). */
export class AppVault extends Vault {}

export const vault = new AppVault();
